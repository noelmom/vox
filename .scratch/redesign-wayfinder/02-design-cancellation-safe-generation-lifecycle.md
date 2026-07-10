---
title: "Design a cancellation-safe generation lifecycle"
label: "wayfinder:prototype"
status: closed
assignee: codex
blocked_by: []
---

## Question

Which job-runner and synchronization design guarantees that cancellation, timeout, shutdown, and retries never permit overlapping access to the Chatterbox model, leak temporary/output files, misreport terminal state, or make the UI claim work stopped while inference is still consuming MPS resources?

## Resolution

Use a **single model-owner subprocess** supervised by an async `GenerationCoordinator` in the FastAPI process. The subprocess is the only process allowed to import, load, or call the Chatterbox model. It accepts one inference command at a time over a narrow IPC protocol and emits readiness, progress, result, and failure events.

The API process owns the durable job queue, database transitions, cancellation intent, encoding, and file publication. It never calls `model.generate()` and never relies on cancelling an `asyncio` future to stop blocking inference.

Cancellation semantics:

- A queued job is cancelled immediately without reaching the worker.
- An active job transitions to `cancelling`; the UI says “Stopping…” rather than “Cancelled.”
- The coordinator terminates the model subprocess, waits for confirmed process exit, and escalates to a kill after a bounded grace period.
- Only after the old process is confirmed dead and temporary output is removed does the job become `cancelled`.
- A fresh subprocess enters `loading`; no later job starts until it reports `ready`.

Timeouts use the same isolation boundary but resolve the job as `failed` with a stable timeout code. Shutdown drains no new work, marks queued work interrupted, terminates the worker, and reconciles active state on the next start. Retries are scheduled by the coordinator and are always sequential.

Audio is written under a job-scoped temporary directory and published with an atomic rename only after the coordinator verifies that the job is still active. Database compare-and-set transitions prevent late results from reviving cancelled or failed jobs.

The prototype state machine and interface are captured in [Generation lifecycle prototype](generation-lifecycle-prototype.md).
