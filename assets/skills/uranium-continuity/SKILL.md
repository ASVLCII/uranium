---
name: uranium-continuity
description: Use when resuming interrupted work, approaching compaction, or handing work back with unfinished steps.
---

Read uranium_checkpoint and uranium_workflow. Inspect current files, Git status and saved tool evidence before trusting old state. Save a checkpoint containing goal, completed work, decisions, next actions and blockers. Keep it concise and free of secrets or transcripts. Verify which steps actually completed before rerunning a tool that has external effects. Long-term facts go through reviewed memory; temporary task state stays in the session checkpoint. Do not claim an interrupted or cancelled operation completed.
