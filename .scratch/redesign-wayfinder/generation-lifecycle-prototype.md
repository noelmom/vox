# Generation lifecycle prototype

## Ownership boundary

```text
FastAPI process                                  Model subprocess
┌──────────────────────────────┐                 ┌──────────────────────┐
│ GenerationCoordinator        │  one command →  │ InferenceWorker      │
│ - durable FIFO queue         │  ← one event    │ - imports Torch      │
│ - DB state transitions       │                 │ - owns Chatterbox    │
│ - cancellation/timeout       │                 │ - one render at once │
│ - encoding + atomic publish  │                 │ - no DB/file publish │
└──────────────────────────────┘                 └──────────────────────┘
```

The model subprocess starts with the macOS `spawn` multiprocessing context. There is exactly one live worker generation at a time; the coordinator does not start a replacement until the previous PID has exited.

## Job states

```text
queued ───────────────→ processing ─→ encoding ─→ completed
  │                         │             │
  └→ cancelled              └→ cancelling┘
                                │
                                └→ cancelled (only after worker exit)

processing ─→ recovering ─→ failed(timeout | worker_crash)
queued/processing/encoding ─→ interrupted (server shutdown/restart)
```

Terminal states are `completed`, `cancelled`, `failed`, and `interrupted`. `cancelling` and `recovering` are observable non-terminal states so the UI never claims resources have stopped before that is true.

## Worker states

```text
not_loaded → loading → ready → busy → ready
                  │       │      │
                  └───────┴──────┴→ error/recovering → loading
```

## Coordinator interface

```python
class GenerationCoordinator:
    async def start(self) -> None: ...
    async def submit(self, request: GenerationRequest) -> str: ...
    async def cancel(self, request_id: str) -> JobSnapshot: ...
    async def snapshot(self, request_id: str) -> JobSnapshot: ...
    async def shutdown(self) -> None: ...
```

The router validates and stores a request, then calls `submit`. It does not create an untracked background task. The coordinator is created and closed by the FastAPI lifespan.

## IPC messages

Commands are versioned dataclasses containing JSON-compatible values and file paths:

- `Load`
- `Generate(request_id, chunks, prompt_path, params)`
- `Shutdown`

Events:

- `WorkerReady(sample_rate, device)`
- `ChunkStarted(request_id, index, count)`
- `ChunkFinished(request_id, index, audio_temp_path, duration_s)`
- `GenerationFinished(request_id, sample_rate, generation_s)`
- `GenerationFailed(request_id, stable_code, safe_message)`

No tensors cross the process boundary. Chunk audio is written to a job-scoped temporary directory owned and later cleaned by the coordinator.

## Cancellation and timeout algorithm

1. Compare-and-set the job from `processing`/`encoding` to `cancelling` or `recovering`.
2. Stop dequeuing work.
3. Terminate the model subprocess.
4. Await process exit for a short grace period; kill and await again if needed.
5. Remove the job-scoped temporary directory and any unpublished `.partial` output.
6. Commit the terminal job state.
7. Spawn a replacement worker and expose model state `loading` until `WorkerReady` arrives.
8. Resume the queue.

## Publication invariant

Encoding writes `outputs/.partial/<request_id>/<output_id>.<ext>`. Before publishing, the coordinator checks that the job is still `encoding`, atomically renames the file into `outputs/`, then commits `completed` and the final path in one coordinator-controlled sequence. Startup cleanup removes abandoned partial directories.

## Required tests

- At most one worker PID can be in `busy` state.
- Cancelling queued work never starts the worker.
- Cancelling active work reports `cancelling` until the worker exits.
- A late event from a dead worker cannot change job state.
- Timeout kills the worker before a replacement starts.
- Worker crash fails only the active job and reloads readiness.
- Shutdown and restart reconcile every non-terminal state.
- Partial and temporary files are removed after all failure paths.
- Completed output is never deleted by cancellation racing after publication.
- Fake-worker tests cover the state machine without Torch; one real Apple Silicon smoke test covers MPS process termination and reload.
