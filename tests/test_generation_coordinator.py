import asyncio
from pathlib import Path

import aiosqlite
import numpy as np
import pytest

import api.core.db as db_module
from api.core.generation import GenerationCoordinator
from api.core.generation_protocol import GenerationChunk, GenerationRequest, WorkerEvent


class FakeWorker:
    def __init__(self, events: list[WorkerEvent | None]):
        self.events = events
        self.alive = True
        self.sent: list[GenerationRequest] = []
        self.terminated = False
        self.killed = False
        self.joined = False

    def send(self, request):
        self.sent.append(request)

    def receive(self, timeout):
        if self.events:
            return self.events.pop(0)
        return None

    def is_alive(self):
        return self.alive

    def terminate(self):
        self.terminated = True
        self.alive = False

    def kill(self):
        self.killed = True
        self.alive = False

    def join(self, timeout=None):
        self.joined = True


@pytest.fixture
async def generation_db(tmp_path, monkeypatch):
    db = await aiosqlite.connect(tmp_path / "jobs.db")
    db.row_factory = aiosqlite.Row
    await db.executescript(
        """CREATE TABLE jobs (
        request_id TEXT PRIMARY KEY, status TEXT, error TEXT, error_code TEXT,
        state_detail TEXT, output_path TEXT, chunks INTEGER, audio_duration_s REAL,
        generation_s REAL, encode_s REAL, total_s REAL, rtf REAL, device TEXT,
        progress_current INTEGER, progress_total INTEGER, completed_at TEXT);
        """
    )
    monkeypatch.setattr(db_module, "_db", db)
    yield db
    await db.close()


def request_for(tmp_path: Path, request_id: str = "job-1"):
    return GenerationRequest(
        request_id=request_id,
        chunks=(GenerationChunk("hello"),), params={}, audio_prompt_path=None,
        partial_dir=str(tmp_path / ".partial" / request_id), output_format="wav",
    )


async def status_of(db, request_id="job-1"):
    async with db.execute("SELECT * FROM jobs WHERE request_id=?", (request_id,)) as cur:
        return await cur.fetchone()


@pytest.mark.asyncio
async def test_queued_cancel_never_reaches_worker(generation_db, tmp_path):
    db = generation_db
    worker = FakeWorker([WorkerEvent(kind="ready", device="cpu")])
    coordinator = GenerationCoordinator(lambda: worker, output_dir=tmp_path)
    await coordinator.start()
    await db.execute("INSERT INTO jobs(request_id,status) VALUES('job-1','queued')")
    await db.commit()
    assert await coordinator.cancel("job-1") == "cancelled"
    await coordinator.submit(request_for(tmp_path))
    await asyncio.sleep(0.05)
    assert worker.sent == []
    assert (await status_of(db))["status"] == "cancelled"
    await coordinator.shutdown()


@pytest.mark.asyncio
async def test_active_cancel_reaps_worker_before_terminal_state(generation_db, tmp_path):
    db = generation_db
    first = FakeWorker([WorkerEvent(kind="ready", device="cpu")])
    replacement = FakeWorker([WorkerEvent(kind="ready", device="cpu")])
    workers = iter([first, replacement])
    coordinator = GenerationCoordinator(lambda: next(workers), output_dir=tmp_path)
    await coordinator.start()
    await db.execute("INSERT INTO jobs(request_id,status) VALUES('job-1','queued')")
    await db.commit()
    await coordinator.submit(request_for(tmp_path))
    for _ in range(50):
        if first.sent:
            break
        await asyncio.sleep(0.01)
    assert await coordinator.cancel("job-1") == "cancelling"
    assert (await status_of(db))["status"] == "cancelling"
    for _ in range(50):
        if (await status_of(db))["status"] == "cancelled":
            break
        await asyncio.sleep(0.01)
    assert first.terminated and first.joined
    assert (await status_of(db))["status"] == "cancelled"
    await coordinator.shutdown()


@pytest.mark.asyncio
async def test_restart_reconciliation_cleans_partials(generation_db, tmp_path):
    db = generation_db
    await db.execute("INSERT INTO jobs(request_id,status) VALUES('job-1','encoding')")
    await db.commit()
    partial = tmp_path / ".partial" / "job-1"
    partial.mkdir(parents=True)
    (partial / "orphan.wav").write_bytes(b"partial")
    worker = FakeWorker([WorkerEvent(kind="ready", device="cpu")])
    coordinator = GenerationCoordinator(lambda: worker, output_dir=tmp_path)
    await coordinator.start()
    row = await status_of(db)
    assert row["status"] == "interrupted"
    assert row["error_code"] == "server_restarted"
    assert not partial.exists()
    await coordinator.shutdown()


@pytest.mark.asyncio
async def test_worker_crash_recovers_only_after_old_worker_is_reaped(generation_db, tmp_path):
    db = generation_db
    first = FakeWorker([WorkerEvent(kind="ready", device="cpu"), None])
    replacement = FakeWorker([WorkerEvent(kind="ready", device="cpu")])
    workers = iter([first, replacement])
    coordinator = GenerationCoordinator(lambda: next(workers), output_dir=tmp_path)
    await coordinator.start()
    await db.execute("INSERT INTO jobs(request_id,status) VALUES('job-1','queued')")
    await db.commit()
    await coordinator.submit(request_for(tmp_path))
    for _ in range(50):
        if first.sent:
            first.alive = False
            break
        await asyncio.sleep(0.01)
    for _ in range(50):
        if (await status_of(db))["status"] == "failed":
            break
        await asyncio.sleep(0.01)
    row = await status_of(db)
    assert row["status"] == "failed"
    assert row["error_code"] == "worker_crashed"
    assert first.joined
    await coordinator.shutdown()


@pytest.mark.asyncio
async def test_success_atomically_publishes_audio_and_cleans_partial(generation_db, tmp_path):
    db = generation_db
    request = request_for(tmp_path)
    partial = Path(request.partial_dir)
    segment = partial / "segment-0000.npy"
    worker = FakeWorker([
        WorkerEvent(kind="ready", device="cpu"),
        WorkerEvent(
            kind="finished", request_id="job-1", sample_rate=24000,
            segment_paths=(str(segment),), generation_s=0.2, device="cpu",
        ),
    ])
    coordinator = GenerationCoordinator(lambda: worker, output_dir=tmp_path)
    await coordinator.start()
    partial.mkdir(parents=True)
    np.save(segment, np.ones(2400, dtype=np.float32), allow_pickle=False)
    await db.execute("INSERT INTO jobs(request_id,status) VALUES('job-1','queued')")
    await db.commit()
    await coordinator.submit(request)
    for _ in range(50):
        if (await status_of(db))["status"] == "completed":
            break
        await asyncio.sleep(0.01)
    row = await status_of(db)
    assert row["status"] == "completed"
    assert Path(row["output_path"]).is_file()
    assert Path(row["output_path"]).parent == tmp_path.resolve()
    assert not partial.exists()
    await coordinator.shutdown()


@pytest.mark.asyncio
async def test_timeout_reaps_worker_before_starting_replacement(generation_db, tmp_path):
    db = generation_db
    first = FakeWorker([WorkerEvent(kind="ready", device="cpu")])
    replacement = FakeWorker([WorkerEvent(kind="ready", device="cpu")])
    created: list[FakeWorker] = []

    def factory():
        worker = first if not created else replacement
        if created:
            assert first.joined
        created.append(worker)
        return worker

    coordinator = GenerationCoordinator(factory, output_dir=tmp_path, job_timeout_s=0.01)
    await coordinator.start()
    await db.execute("INSERT INTO jobs(request_id,status) VALUES('job-1','queued')")
    await db.commit()
    await coordinator.submit(request_for(tmp_path))
    for _ in range(100):
        if (await status_of(db))["status"] == "failed":
            break
        await asyncio.sleep(0.01)
    row = await status_of(db)
    assert row["error_code"] == "generation_timeout"
    assert first.terminated and first.joined
    assert created == [first, replacement]
    await coordinator.shutdown()


def test_api_generation_modules_do_not_import_model_runtime():
    import api.core.engine  # noqa: F401
    import api.core.generation  # noqa: F401

    import sys
    assert "torch" not in sys.modules
    assert "chatterbox.tts" not in sys.modules
