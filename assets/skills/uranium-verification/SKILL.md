---
name: uranium-verification
description: Use for reviews, test failures, debugging and deciding whether requested work is actually complete.
---

Establish expected and observed behavior. Trace the real execution path, check the cause before changing code, and preserve unrelated work. Add regression checks for meaningful bugs rather than mirroring implementation. Run focused checks first, then required broader checks. A successful shell invocation alone is not a passing test: inspect exit status and test results. Record failures and blockers accurately. Before completion compare every requested result with observed evidence. Model summaries and captured memory do not substitute for tests, code review or live verification.
