# Changelog

## 0.3.0 — 2026-10-30

- Reduce the server bundle by using public SDK types instead of bundling runtime schema constructors for fixed identifiers.
- Skip Python recall for empty stores and combine project/personal recall in one short-lived bridge.
- Preserve recall provenance and unresolved status, share context space between scopes and maintain the 3,500-character limit.
- Open continuity storage lazily and save bounded automatic tool recovery observations. Preserve explicit checkpoints; seed an initial checkpoint from new workflow plans.
- Retain unfinished overlapping calls across restart; never classify an observation as verified task completion.
- Bound bridge responses and cancellation, terminate the owned Windows Python process tree on cancellation, and keep native work usable when automatic continuity writes fail.
- Add regression tests, an equivalent-workload benchmark and native-host CI checks on Windows, Linux and macOS.

Koi remains separate and opt-in. The memory engine and stored record format remain unchanged. No new runtime service or model call is introduced. Full task scheduling, isolated execution and verified end-to-end model quality are not claimed.
