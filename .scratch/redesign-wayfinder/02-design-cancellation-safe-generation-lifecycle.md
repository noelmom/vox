---
title: "Design a cancellation-safe generation lifecycle"
label: "wayfinder:prototype"
status: open
assignee: null
blocked_by: []
---

## Question

Which job-runner and synchronization design guarantees that cancellation, timeout, shutdown, and retries never permit overlapping access to the Chatterbox model, leak temporary/output files, misreport terminal state, or make the UI claim work stopped while inference is still consuming MPS resources?
