import asyncio
import multiprocessing
import os
import signal
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from queue import Empty
from typing import Callable, Protocol

import numpy as np
from api.core.config import settings
from api.core.db import get_db
from api.core.data_safety import managed_path, stored_managed_path
from api.core.generation_protocol import GenerationRequest, WorkerEvent
from api.core.logger import get_logger

log = get_logger(__name__)
TERMINAL_STATES = {"completed", "failed", "cancelled", "interrupted"}
NONTERMINAL_STATES = {"queued", "processing", "cancelling", "encoding", "recovering"}


class EncoderWouldNotStop(RuntimeError):
    pass


class CleanupFailed(RuntimeError):
    pass


def _stitch_chunks(chunks: list[tuple[np.ndarray, float]], sample_rate: int) -> np.ndarray:
    pieces: list[np.ndarray] = []
    output_dtype = next((chunk.dtype for chunk, _ in chunks if chunk.size), np.float32)
    for index, (chunk, pause_after_s) in enumerate(chunks):
        if not chunk.size:
            continue
        pieces.append(chunk)
        if pause_after_s > 0 and index < len(chunks) - 1:
            pieces.append(np.zeros(int(sample_rate * pause_after_s), dtype=output_dtype))
    return np.concatenate(pieces) if pieces else np.array([], dtype=np.float32)


class WorkerHandle(Protocol):
    def send(self, request: GenerationRequest) -> None: ...
    def receive(self, timeout: float) -> WorkerEvent | None: ...
    def is_alive(self) -> bool: ...
    def terminate(self) -> None: ...
    def kill(self) -> None: ...
    def join(self, timeout: float | None = None) -> None: ...


class ProcessWorker:
    def __init__(self) -> None:
        from api.core.generation_worker import worker_main

        context = multiprocessing.get_context("spawn")
        self.commands = context.Queue()
        self.events = context.Queue()
        self.process = context.Process(
            target=worker_main,
            args=(self.commands, self.events, settings.device, settings.hf_token),
            name="vox-generation-worker",
        )
        self.process.start()

    @property
    def pid(self) -> int | None:
        return self.process.pid

    def send(self, request: GenerationRequest) -> None:
        self.commands.put(request.to_message())

    def receive(self, timeout: float) -> WorkerEvent | None:
        try:
            return WorkerEvent.from_message(self.events.get(timeout=timeout))
        except Empty:
            return None

    def is_alive(self) -> bool:
        return self.process.is_alive()

    def terminate(self) -> None:
        self.process.terminate()

    def kill(self) -> None:
        self.process.kill()

    def join(self, timeout: float | None = None) -> None:
        self.process.join(timeout)


@dataclass
class _ActiveJob:
    request: GenerationRequest
    cancelled: asyncio.Event


class GenerationCoordinator:
    def __init__(
        self,
        worker_factory: Callable[[], WorkerHandle] = ProcessWorker,
        *,
        output_dir: Path | None = None,
        job_timeout_s: float = 900,
        terminate_grace_s: float = 5,
        publication_timeout_s: float = 120,
        shutdown_timeout_s: float = 15,
    ) -> None:
        self.worker_factory = worker_factory
        self.output_dir = (output_dir or settings.output_dir).resolve()
        self.partial_root = self.output_dir / ".partial"
        self.job_timeout_s = job_timeout_s
        self.terminate_grace_s = terminate_grace_s
        self.publication_timeout_s = publication_timeout_s
        self.shutdown_timeout_s = shutdown_timeout_s
        self.queue: asyncio.Queue[GenerationRequest] = asyncio.Queue()
        self.worker: WorkerHandle | None = None
        self._encoder_process = None
        self._quarantined_encoder_request: GenerationRequest | None = None
        self._runner: asyncio.Task | None = None
        self._active: _ActiveJob | None = None
        self._requests: dict[str, GenerationRequest] = {}
        self._state_lock = asyncio.Lock()
        self._shutting_down = False
        self._ready = False
        self._state = "not_loaded"
        self._detail = "Model worker has not started."
        self._device: str | None = None
        self._started_at: float | None = None

    def status(self) -> dict[str, str | bool | int | float | None]:
        return {
            "state": self._state,
            "ready": self._ready,
            "detail": self._detail,
            "device": self._device or settings.device,
            "started_at": self._started_at,
            "ready_at": None,
            "worker_pid": getattr(self.worker, "pid", None),
        }

    async def start(self) -> None:
        self.partial_root.mkdir(parents=True, exist_ok=True)
        await self.reconcile_after_restart()
        await self._spawn_worker()
        self._runner = asyncio.create_task(self._run(), name="generation-coordinator")

    async def shutdown(self) -> None:
        self._shutting_down = True
        resources_stopped = True
        if self._active:
            await self._cas(self._active.request.request_id, NONTERMINAL_STATES, "cancelling", state_detail="Stopping for Vox shutdown…")
            self._active.cancelled.set()
            resources_stopped = await self._stop_worker() and resources_stopped
            resources_stopped = await self._stop_encoder() and resources_stopped
        shutdown_deadline = time.monotonic() + self.shutdown_timeout_s
        timed_out_request_id: str | None = None
        if self._runner and self._active:
            while self._active and time.monotonic() < shutdown_deadline:
                await asyncio.sleep(0.05)
            if self._active:
                timed_out_request_id = self._active.request.request_id
        if self._runner:
            self._runner.cancel()
            await asyncio.gather(self._runner, return_exceptions=True)
            self._runner = None
        resources_stopped = await self._stop_worker() and resources_stopped
        resources_stopped = await self._stop_encoder() and resources_stopped
        for request in list(self._requests.values()):
            if request.request_id == timed_out_request_id:
                continue
            if await self._cleanup_or_recover(request):
                await self._cas(request.request_id, NONTERMINAL_STATES, "interrupted", error_code="server_shutdown", error="Vox stopped before generation completed.", terminal=True)
        self._requests.clear()
        self._state = "stopped" if resources_stopped else "error"
        self._ready = False

    async def submit(self, request: GenerationRequest) -> None:
        self._requests[request.request_id] = request
        await self.queue.put(request)

    async def cancel(self, request_id: str) -> str:
        async with self._state_lock:
            status = await self._job_status(request_id)
            if status is None:
                raise KeyError(request_id)
            if status in TERMINAL_STATES:
                return status
            if self._active and self._active.request.request_id == request_id:
                changed = await self._cas(request_id, {"processing", "encoding", "recovering"}, "cancelling", state_detail="Stopping the model worker…")
                if changed:
                    self._active.cancelled.set()
                    return "cancelling"
            else:
                request = self._requests.get(request_id)
                try:
                    if request:
                        await self._cleanup_or_recover(request)
                except OSError:
                    await self._cas(request_id, {"queued"}, "recovering", error_code="cleanup_failed", error="Private generation files could not be removed; restart Vox to retry cleanup.")
                    return "recovering"
                if await self._cas(request_id, {"queued"}, "cancelled", error_code="cancelled_by_user", error="Generation cancelled by user.", terminal=True):
                    self._requests.pop(request_id, None)
                    return "cancelled"
            return await self._job_status(request_id) or "interrupted"

    async def reconcile_after_restart(self) -> None:
        db = await get_db()
        for marker in self.output_dir.glob(".publishing-*--*"):
            if marker.is_symlink():
                marker.unlink(missing_ok=True)
                continue
            marker = managed_path(self.output_dir, marker.name)
            request_id = marker.name.removeprefix(".publishing-").split("--", 1)[0]
            async with db.execute(
                "SELECT status, output_path FROM jobs WHERE request_id=?", (request_id,)
            ) as cur:
                row = await cur.fetchone()
            if row and row["status"] == "encoding" and row["output_path"]:
                final_path = stored_managed_path(self.output_dir, row["output_path"])
                expected_marker = managed_path(self.output_dir, f".publishing-{request_id}--{final_path.name}")
                if marker.resolve() == expected_marker:
                    marker.replace(final_path)
                    await db.execute(
                        "UPDATE jobs SET status='completed', state_detail='Audio is ready.', completed_at=datetime('now') WHERE request_id=? AND status='encoding'",
                        (request_id,),
                    )
                    await db.commit()
                    continue
            marker.unlink(missing_ok=True)
        async with db.execute(
            "SELECT request_id, output_path FROM jobs WHERE status='encoding' AND output_path IS NOT NULL"
        ) as cur:
            publishing_rows = await cur.fetchall()
        for row in publishing_rows:
            final_path = stored_managed_path(self.output_dir, row["output_path"])
            if final_path.is_file():
                await db.execute(
                    "UPDATE jobs SET status='completed', state_detail='Audio is ready.', completed_at=datetime('now') WHERE request_id=? AND status='encoding'",
                    (row["request_id"],),
                )
        await db.execute(
            """UPDATE jobs SET status='interrupted', error_code='server_restarted',
               state_detail='Generation was interrupted by a Vox restart.',
               error='Generation was interrupted because Vox restarted.', completed_at=datetime('now')
               WHERE status IN ('queued','processing','cancelling','encoding','recovering')"""
        )
        await db.commit()
        if self.partial_root.exists():
            for child in self.partial_root.iterdir():
                if child.is_symlink():
                    child.unlink(missing_ok=True)
                    continue
                child = managed_path(self.partial_root, child.name)
                if child.is_dir():
                    shutil.rmtree(child)
                else:
                    child.unlink(missing_ok=True)

    async def _spawn_worker(self) -> None:
        self._state = "loading"
        self._detail = "Loading Chatterbox in an isolated model worker."
        self._ready = False
        self._started_at = time.time()
        self.worker = self.worker_factory()

    async def _wait_ready(self) -> bool:
        assert self.worker
        while True:
            event = await asyncio.to_thread(self.worker.receive, 0.2)
            if event and event.kind == "ready":
                self._state, self._ready, self._device = "ready", True, event.device
                self._detail = f"Chatterbox model loaded on {event.device}."
                return True
            if event and event.kind == "load_failed":
                self._state, self._detail = "error", event.detail or "Model worker failed to load."
                return False
            if not self.worker.is_alive():
                self._state, self._detail = "error", "Model worker exited while loading."
                return False

    async def _run(self) -> None:
        while not self._shutting_down:
            if self._encoder_process is not None:
                encoder = self._encoder_process
                if encoder.is_alive() or self._process_group_alive(getattr(encoder, "pid", None)):
                    self._ready = False
                    self._state = "error"
                    if not await self._stop_encoder():
                        await asyncio.sleep(0.25)
                        continue
                encoder.join(0)
                quarantined = self._quarantined_encoder_request
                if quarantined:
                    try:
                        self._purge_publication_markers(quarantined.request_id)
                    except OSError as exc:
                        await self._cas(quarantined.request_id, NONTERMINAL_STATES, "recovering", error_code="cleanup_failed", error=f"Publishing marker cleanup failed: {exc}")
                        await asyncio.sleep(0.25)
                        continue
                    if not await self._cleanup_or_recover(quarantined):
                        await asyncio.sleep(0.25)
                        continue
                    await self._cas(quarantined.request_id, {"recovering", "cancelling", "encoding"}, "failed", error_code="encoder_would_not_stop", error="The quarantined encoder exited; no audio was published.", terminal=True)
                self._encoder_process = None
                self._quarantined_encoder_request = None
                if self.worker and self.worker.is_alive():
                    self._ready = True
                    self._state = "ready"
                    self._detail = f"Chatterbox model loaded on {self._device}."
            if not self._ready and not await self._wait_ready():
                await asyncio.sleep(2)
                if await self._stop_worker():
                    await self._spawn_worker()
                continue
            request = await self.queue.get()
            try:
                async with self._state_lock:
                    if not await self._cas(request.request_id, {"queued"}, "processing", state_detail="Generating audio…"):
                        self._requests.pop(request.request_id, None)
                        await self._cleanup_request(request)
                        continue
                    self._active = _ActiveJob(request, asyncio.Event())
                    db = await get_db()
                    await db.execute(
                        "UPDATE jobs SET progress_current=0, progress_total=? WHERE request_id=? AND status='processing'",
                        (len(request.chunks), request.request_id),
                    )
                    await db.commit()
                await self._execute_active()
            finally:
                self._active = None
                self._requests.pop(request.request_id, None)
                self.queue.task_done()

    async def _execute_active(self) -> None:
        assert self.worker and self._active
        request, cancelled = self._active.request, self._active.cancelled
        self._request_partial(request).mkdir(parents=True, exist_ok=True)
        self.worker.send(request)
        attempt = 1
        started = time.monotonic()
        event: WorkerEvent | None = None
        failure_code: str | None = None
        while event is None:
            if cancelled.is_set():
                stopped = await self._stop_worker()
                if not stopped:
                    await self._cas(request.request_id, {"cancelling"}, "cancelling", state_detail="Model worker did not stop; restart Vox before generating again.")
                    return
                if not await self._cleanup_or_recover(request):
                    return
                await self._finish_stopped_request(request.request_id)
                await self._restart_worker()
                return
            if time.monotonic() - started > self.job_timeout_s:
                failure_code = "generation_timeout"
                break
            event = await asyncio.to_thread(self.worker.receive, 0.2)
            if event and event.request_id != request.request_id:
                event = None  # Ignore stale output from a prior worker request.
            if event and event.kind in {"chunk_started", "chunk_finished"}:
                if event.kind == "chunk_finished":
                    db = await get_db()
                    await db.execute(
                        "UPDATE jobs SET progress_current=?, state_detail=? WHERE request_id=? AND status='processing'",
                        (int(event.detail or 0), f"Generated chunk {event.detail} of {len(request.chunks)}…", request.request_id),
                    )
                    await db.commit()
                event = None
            if event and event.kind == "failed" and event.error_code == "generation_truncated" and attempt < 3:
                attempt += 1
                partial_dir = self._request_partial(request)
                for segment in partial_dir.glob("segment-*.npy"):
                    managed_path(partial_dir, segment.name).unlink(missing_ok=True)
                db = await get_db()
                await db.execute(
                    "UPDATE jobs SET progress_current=0, state_detail=? WHERE request_id=? AND status='processing'",
                    (f"Retrying truncated audio (attempt {attempt} of 3)…", request.request_id),
                )
                await db.commit()
                self.worker.send(request)
                event = None
            if not self.worker.is_alive() and event is None:
                failure_code = "worker_crashed"
                break

        if failure_code:
            await self._cas(request.request_id, {"processing"}, "recovering", state_detail="Restarting the model worker…")
            stopped = await self._stop_worker()
            if not await self._cleanup_or_recover(request):
                if stopped:
                    await self._restart_worker()
                return
            if cancelled.is_set():
                await self._finish_stopped_request(request.request_id)
                if stopped:
                    await self._restart_worker()
                return
            if stopped:
                await self._cas(request.request_id, {"recovering"}, "failed", error_code=failure_code, error="The model worker stopped unexpectedly. Vox recovered and is ready to retry.", terminal=True)
                await self._restart_worker()
            else:
                await self._cas(request.request_id, {"recovering"}, "recovering", error_code="worker_would_not_stop", error="The model worker could not be stopped safely. Restart Vox before generating again.")
            return
        if cancelled.is_set():
            stopped = await self._stop_worker()
            if not stopped:
                await self._cas(request.request_id, {"cancelling", "processing"}, "cancelling", state_detail="Model worker did not stop; restart Vox before generating again.")
                return
            if not await self._cleanup_or_recover(request):
                return
            await self._finish_stopped_request(request.request_id)
            await self._restart_worker()
            return
        if event is None or event.kind == "failed":
            if not await self._cleanup_or_recover(request):
                return
            await self._cas(request.request_id, {"processing"}, "failed", error_code=(event.error_code if event else "generation_failed"), error=(event.detail if event else "Generation failed."), terminal=True)
            return
        await self._cas(request.request_id, {"processing"}, "encoding", state_detail="Encoding final audio…")
        try:
            await self._publish(request, event)
            if cancelled.is_set():
                stopped = await self._stop_worker()
                if not stopped:
                    await self._cas(request.request_id, {"cancelling"}, "cancelling", state_detail="Model worker did not stop; restart Vox before generating again.")
                    return
                if not await self._cleanup_or_recover(request):
                    return
                await self._finish_stopped_request(request.request_id)
                await self._restart_worker()
        except EncoderWouldNotStop:
            self._quarantined_encoder_request = request
            await self._cas(request.request_id, {"encoding", "cancelling"}, "recovering", error_code="encoder_would_not_stop", error="The audio encoder could not be stopped safely. Restart Vox before generating again.")
        except CleanupFailed as exc:
            await self._cas(request.request_id, {"encoding", "cancelling"}, "recovering", error_code="cleanup_failed", error=str(exc))
        except Exception as exc:
            if await self._cleanup_or_recover(request):
                await self._cas(request.request_id, {"encoding"}, "failed", error_code="encoding_failed", error=str(exc), terminal=True)

    async def _publish(self, request: GenerationRequest, event: WorkerEvent) -> None:
        if not event.sample_rate or not event.segment_paths:
            raise RuntimeError("Model worker returned no audio.")
        process, results = self._launch_encoder(request, event)
        try:
            process.start()
        except Exception:
            self._encoder_process = None
            raise
        self._encoder_process = process
        deadline = time.monotonic() + self.publication_timeout_s
        result = None
        while result is None and process.is_alive():
            if (self._active and self._active.cancelled.is_set()) or self._shutting_down:
                if not await self._stop_encoder():
                    raise EncoderWouldNotStop()
                try:
                    self._purge_publication_markers(request.request_id)
                except OSError as exc:
                    raise CleanupFailed(f"Publishing marker cleanup failed: {exc}") from exc
                return
            if time.monotonic() >= deadline:
                if not await self._stop_encoder():
                    raise EncoderWouldNotStop()
                try:
                    self._purge_publication_markers(request.request_id)
                except OSError as exc:
                    raise CleanupFailed(f"Publishing marker cleanup failed: {exc}") from exc
                raise TimeoutError("Audio encoding timed out.")
            try:
                result = await asyncio.to_thread(results.get, True, 0.2)
            except Empty:
                pass
        await asyncio.to_thread(process.join, self.terminate_grace_s)
        if process.is_alive() or self._process_group_alive(getattr(process, "pid", None)):
            if not await self._stop_encoder():
                raise EncoderWouldNotStop()
        else:
            self._encoder_process = None
        if result is None:
            try:
                result = results.get_nowait()
            except Empty as exc:
                raise RuntimeError("Audio encoder exited without a result.") from exc
        if not result["ok"]:
            raise RuntimeError(result["error"])
        marker_path = stored_managed_path(self.output_dir, result["marker"])
        final_path = stored_managed_path(self.output_dir, result["final"])
        await self._commit_publication(
            request, event, marker_path, final_path,
            result["samples"], result["encode_s"], result["total_s"],
        )

    def _launch_encoder(self, request: GenerationRequest, event: WorkerEvent):
        from api.core.generation_encoder import encoder_main

        context = multiprocessing.get_context("spawn")
        results = context.Queue()
        process = context.Process(
            target=encoder_main,
            args=(request, event, str(self.output_dir), results),
            name=f"vox-encoder-{request.request_id[:8]}",
        )
        return process, results

    async def _commit_publication(
        self, request: GenerationRequest, event: WorkerEvent, marker_path: Path, final_path: Path,
        sample_count: int, encode_s: float, total_s: float,
    ) -> None:
        duration = sample_count / int(event.sample_rate or 1)
        db = await get_db()
        try:
            cursor = await db.execute(
                """UPDATE jobs SET state_detail='Publishing final audio…', error_code=NULL,
               output_path=?, chunks=?, audio_duration_s=?, generation_s=?, encode_s=?, total_s=?, rtf=?,
               device=?, progress_current=?, progress_total=?
               WHERE request_id=? AND status='encoding'""",
                (str(final_path), len(request.chunks), duration, event.generation_s, encode_s, total_s,
                 (event.generation_s or 0) / duration if duration else 0, event.device,
                 len(request.chunks), len(request.chunks), request.request_id),
            )
            await db.commit()
            if cursor.rowcount != 1:
                marker_path.unlink(missing_ok=True)
                return
            marker_path.replace(final_path)
            await self._cleanup_request(request)
            cursor = await db.execute(
                """UPDATE jobs SET status='completed', state_detail='Audio is ready.', completed_at=datetime('now')
               WHERE request_id=? AND status='encoding' AND output_path=?""",
                (request.request_id, str(final_path)),
            )
            await db.commit()
            if cursor.rowcount != 1:
                final_path.unlink(missing_ok=True)
        except Exception:
            await db.rollback()
            marker_path.unlink(missing_ok=True)
            final_path.unlink(missing_ok=True)
            raise

    async def _cleanup_request(self, request: GenerationRequest) -> None:
        partial = self._request_partial(request)
        if partial.exists():
            shutil.rmtree(partial)
        if partial.exists():
            raise OSError(f"Could not remove generation partial directory: {partial}")

    async def _cleanup_or_recover(self, request: GenerationRequest) -> bool:
        try:
            await self._cleanup_request(request)
            return True
        except OSError as exc:
            await self._cas(
                request.request_id, NONTERMINAL_STATES, "recovering",
                error_code="cleanup_failed",
                error=f"Private generation files could not be removed: {exc}",
            )
            return False

    def _purge_publication_markers(self, request_id: str) -> None:
        for marker in self.output_dir.glob(f".publishing-{request_id}--*"):
            if marker.is_symlink():
                marker.unlink(missing_ok=True)
            else:
                managed_path(self.output_dir, marker.name).unlink(missing_ok=True)

    def _request_partial(self, request: GenerationRequest) -> Path:
        path = managed_path(self.partial_root, request.request_id)
        if path != Path(request.partial_dir).resolve():
            raise RuntimeError("Generation request has an invalid partial directory.")
        return path

    async def _stop_encoder(self) -> bool:
        process = self._encoder_process
        if process is None:
            return True
        if process.is_alive():
            pid = getattr(process, "pid", None)
            if pid:
                try:
                    os.killpg(pid, signal.SIGTERM)
                except ProcessLookupError:
                    process.terminate()
            else:
                process.terminate()
            await asyncio.to_thread(process.join, self.terminate_grace_s)
        pid = getattr(process, "pid", None)
        if process.is_alive() or self._process_group_alive(pid):
            if pid:
                try:
                    os.killpg(pid, signal.SIGKILL)
                except ProcessLookupError:
                    if process.is_alive():
                        process.kill()
            elif process.is_alive():
                process.kill()
            await asyncio.to_thread(process.join, self.terminate_grace_s)
        if process.is_alive() or self._process_group_alive(pid):
            self._state = "error"
            self._ready = False
            self._detail = "Audio encoder could not be stopped; restart Vox."
            return False
        self._encoder_process = None
        return True

    @staticmethod
    def _process_group_alive(pid: int | None) -> bool:
        if not pid:
            return False
        try:
            os.killpg(pid, 0)
            return True
        except ProcessLookupError:
            return False

    async def _stop_worker(self) -> bool:
        worker = self.worker
        self._ready = False
        if not worker:
            return True
        if worker.is_alive():
            worker.terminate()
            await asyncio.to_thread(worker.join, self.terminate_grace_s)
        if worker.is_alive():
            worker.kill()
            await asyncio.to_thread(worker.join, self.terminate_grace_s)
        else:
            await asyncio.to_thread(worker.join, 0)
        if worker.is_alive():
            self._state = "error"
            self._detail = "Model worker could not be stopped; replacement is blocked."
            return False
        self.worker = None
        return True

    async def _restart_worker(self) -> None:
        if not self._shutting_down and self.worker is None and self._state != "error":
            await self._spawn_worker()

    async def _finish_stopped_request(self, request_id: str) -> None:
        if self._shutting_down:
            await self._cas(request_id, NONTERMINAL_STATES, "interrupted", error_code="server_shutdown", error="Vox stopped before generation completed.", terminal=True)
        else:
            await self._cas(request_id, {"processing", "cancelling", "recovering", "encoding"}, "cancelled", error_code="cancelled_by_user", error="Generation cancelled by user.", terminal=True)

    async def _job_status(self, request_id: str) -> str | None:
        db = await get_db()
        async with db.execute("SELECT status FROM jobs WHERE request_id=?", (request_id,)) as cur:
            row = await cur.fetchone()
        return row["status"] if row else None

    async def _cas(
        self, request_id: str, expected: set[str], target: str, *, state_detail: str | None = None,
        error_code: str | None = None, error: str | None = None, terminal: bool = False,
    ) -> bool:
        db = await get_db()
        placeholders = ",".join("?" for _ in expected)
        completed = ", completed_at=datetime('now')" if terminal else ""
        cursor = await db.execute(
            f"UPDATE jobs SET status=?, state_detail=?, error_code=?, error=?{completed} WHERE request_id=? AND status IN ({placeholders})",
            (target, state_detail, error_code, error, request_id, *expected),
        )
        await db.commit()
        return cursor.rowcount == 1


_coordinator: GenerationCoordinator | None = None


def set_generation_coordinator(coordinator: GenerationCoordinator | None) -> None:
    global _coordinator
    _coordinator = coordinator


def get_generation_coordinator() -> GenerationCoordinator:
    if _coordinator is None:
        raise RuntimeError("Generation coordinator has not started.")
    return _coordinator
