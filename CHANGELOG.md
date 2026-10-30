# Changelog

## 0.4.0 — 2026-10-30

- Add on-demand recall explanations through `uranium memory explain`, `uranium_memory` and `/uranium-memory-explain`. Distinguish canonical engine exclusions from adapter budget cuts, preserving the existing recall budget and admission rules.
- Add explicit project-local handoffs between sessions through `uranium_handoff` and `/uranium-handoff`. Check Git revision/status and optional bounded file hashes; protect current progress and treat imported completed work as unverified historical claims.
- Bound handoff history to 20 snapshots per project, 12,000 characters per snapshot and eight files of at most 1 MiB each. Store hashes rather than file contents; exclude personal memory and transcripts.
- Report continuity diagnostics when Python is unavailable, release all hooks despite disposal errors, and clean up partial plugin setup. Add a real bridge-cancellation regression.
- Scan memory-store directory entries incrementally. Handoff and inspection work runs only when requested; no new dependency, worker service, polling loop or automatic model call.

## 0.3.0 — 2026-10-30

- Reduce the server bundle by using public SDK types instead of bundling runtime schema constructors for fixed identifiers.
- Skip Python recall for empty stores and combine project/personal recall in one short-lived bridge.
- Preserve recall provenance and unresolved status, share context space between scopes and maintain the 3,500-character limit.
- Open continuity storage lazily and save bounded automatic tool recovery observations. Preserve explicit checkpoints; seed an initial checkpoint from new workflow plans.
- Retain unfinished overlapping calls across restart; never classify an observation as verified task completion.
- Bound bridge responses and cancellation, terminate the owned Windows Python process tree on cancellation, and keep native work usable when automatic continuity writes fail.
- Add regression tests, an equivalent-workload benchmark and native-host CI checks on Windows, Linux and macOS.

Koi remains separate and opt-in. The memory engine and stored record format remain unchanged. No new runtime service or model call is introduced. Full task scheduling, isolated execution and verified end-to-end model quality are not claimed.
