---
title: "Validate the redesigned application workflows"
label: "wayfinder:prototype"
status: closed
assignee: codex
blocked_by: []
---

## Question

What exact responsive workflows, information hierarchy, persistent-player behavior, offline/loading/error states, accessibility contracts, and route responsibilities should define Create, Voices, History, and Settings before the visual concepts become implementation specifications?

## Resolution

Adopt the approved persistent creative-workspace direction captured in [Vox Studio application workflow specification](ui-workflow-spec.md) and the linked full-page prototypes.

The production application has four canonical destinations—Create, Voices, History, and Settings—plus compatibility redirects from the existing Library, Recordings, and Logs URLs. The shell owns authentication, truthful global status, navigation, and one persistent audio player; routes own their data and task-specific composition.

Create centers the script and truthful generation state, uses an inspector on wide screens and a summary-triggered sheet on mobile, shows three compact previous recordings, and never displays simulated progress. Voices uses a stable collection plus inspector rather than expanding cards. History is a dense, filterable list with detail only for the active row. Settings becomes sectioned preferences with dedicated Network, Diagnostics, and Updates surfaces.

The specification fixes responsive breakpoints, global playback semantics, pairing/offline/model recovery behavior, keyboard/screen-reader requirements, production component seams, and initial bundle/asset budgets. The generated concepts are treated as hierarchy references rather than pixel-perfect code.
