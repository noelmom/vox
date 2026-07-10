---
title: "Specify the Sparkle package-update architecture"
label: "wayfinder:research"
status: closed
assignee: codex
blocked_by: []
---

## Question

How should Vox Helper integrate Sparkle through a reproducible native dependency build, securely publish stable/prerelease bare-package appcasts, migrate existing installations through a bridge release, preserve the shell recovery updater, and recover safely from download, authorization, installation, or restart failures?

## Resolution

Vox Helper becomes the sole normal update host using a pinned Sparkle 2 Swift Package Manager dependency and `SPUStandardUpdaterController`. The helper embeds and signs `Sparkle.framework` inside-out, uses a monotonic numeric `CFBundleVersion`, and points at one HTTPS appcast with a committed EdDSA public key.

Releases remain immutable, signed, notarized, stapled flat `.pkg` files. Stable items use Sparkle's default channel; opted-in prereleases use `beta`. Automatic checks are allowed, but automatic installation remains off because package updates require authorization. Appcast publication happens last, only after artifact upload and live verification.

Existing installations receive one manually installed bridge package containing Sparkle. That bridge and a last-known-good package remain downloadable indefinitely. The existing shell updater remains available only as a documented repair/source-install path and never competes with Sparkle's normal menu action.

Package scripts split fresh-install and update behavior. Updates avoid prerequisite downloads and Welcome launch, preserve every user-data path, record the transaction, run idempotent migrations, reload agents deliberately, and expose actionable recovery for installer or health failures. A failed update never triggers an unattended reinstall loop.

The full primary-source research, appcast contract, build/signing order, migration sequence, failure matrix, release gate, and acceptance criteria are recorded in [Sparkle package-update architecture for Vox](sparkle-research.md).
