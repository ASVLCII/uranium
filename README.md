# Uranium

**Reviewed long-term memory, resumable checkpoints and scoped workflows for OpenCode.**

Uranium is an MIT-licensed OpenCode plugin. It adds a durable memory layer using the OMH engine, native memory-review dialogs, task checkpoints, workflow validation and four focused workflow skills. A radioactive green theme is included.

**Koi is not bundled, required or installed.** Existing koi installations can stay in place; adding one is an explicit optional step.

## Install from GitHub using npm

Requirements: **OpenCode 2.2.1**, **Node.js 22+** for the setup CLI, and **Python 3.11+** available as `python` on Windows or `python3` elsewhere. OpenCode supplies Bun and the terminal renderer for the plugin itself. Python's standard library is enough; Hermes, pip and an existing OMH installation are unnecessary.

```sh
npm install -g github:ASVLCII/uranium#v0.4.0
uranium setup
uranium doctor
```

Restart OpenCode, then enter `/memory`. `u92` is an alias for the setup/memory CLI. The plugin runs inside OpenCode; the npm CLI does not replace the OpenCode launcher.

This command installs the versioned **GitHub package through npm**. The package name is `@asvlcii/uranium`; no npm-registry publication is claimed. Built plugin files are included in GitHub, so installation does not run a build or download a model.

`uranium setup` adds the installed plugin directory to `opencode.json(c)`, installs/selects the green theme in `cli.json(c)`, preserves other plugins and comments, and backs up edited files. Use `--no-theme` to keep your theme or `--config-dir PATH` for a different OpenCode config directory. Setup does not copy credentials, change providers or download koi.

Alternatively, clone this repository, run `bun install --frozen-lockfile` and `bun run build`, then `node bin/uranium.mjs setup`. Keep the checkout in place while its absolute path is registered.

## Optional koi

If koi is already installed in OpenCode, **leave it installed**. Uranium preserves it and works without it.

To add [opencode-pond](https://github.com/ASVLCII/opencode-pond) separately, install that project's package through npm in a stable directory:

```sh
npm install github:ASVLCII/opencode-pond
uranium setup --koi ./node_modules/opencode-pond
```

The `--koi` option only registers the package/path you provide; it never downloads anything. Keep that installation directory in place. There is no koi dependency, optional dependency, fish renderer or automatic koi installation inside Uranium.

## What it adds

| Capability | Behavior |
| --- | --- |
| Long-term memory | Project-scoped and deliberately selected personal memory, immutable review revisions, freshness/expiry rules and bounded recall |
| Context delivery | Approved relevant records enter OpenCode's native context hook; delivery receipts distinguish context inclusion from model use |
| Task continuity | Structured checkpoints survive restart and compaction within the same session |
| Workflow planning | Dependency validation, unordered write-scope overlap detection, verification commands and native execution instructions |
| Workflow skills | Delivery, memory, verification and continuity skills registered through OpenCode's native API |

| OpenCode command | Purpose |
| --- | --- |
| `/memory` | Capture, inspect, approve/reject or recall project knowledge |
| `/memory user` | Explicitly manage personal knowledge shared across projects |
| `/uranium-plan <task>` | Ask the agent to create and execute a validated workflow using native tools |
| `/uranium-resume` | Recheck saved task state and continue unfinished work |
| `/uranium-learn` | Propose an evidence-backed reusable lesson for review |
| `/uranium-status` | Explain memory, checkpoint and tool evidence |
| `/uranium-route <task>` | Inspect available models and recommend a choice without switching silently |
| `/uranium-memory-explain <query>` | Explain current recall selection, exclusions and context-budget cuts |
| `/uranium-handoff <action>` | Explicitly create, list, inspect or adopt a handoff between sessions |

## Memory and data

### Explain memory and hand off work in 0.4

Run `uranium memory explain "your query"` for a local diagnostic without a model call. It shows the approved records selected by the same project/personal recall path used by the context hook, available per-scope ranking evidence, engine exclusion reasons and adapter budget cuts. Excluded records expose only IDs and reasons, not their summaries. Output is bounded. This performs a fresh evaluation; it does not reconstruct what a previous request received. Inside OpenCode, `/uranium-memory-explain <query>` asks the agent to interpret those diagnostics through `uranium_memory` action `explain`.

Use `/uranium-handoff create` to ask the agent to save a concise checkpoint and create an explicit project-local handoff. In another session, `/uranium-handoff list`, then `/uranium-handoff inspect <id>` and `/uranium-handoff adopt <id>` make that state available. These slash commands use the current model when requested; handoffs add no automatic model calls. The `uranium_handoff` tool also exposes those four actions directly.

- Handoffs contain the checkpoint, optional workflow and a bounded recovery summary. They exclude personal memory and raw transcripts. No user-data export file or remote upload is created.
- Creation and inspection each make one bounded Git call. Optionally select up to eight relative files in the session's working directory, at most 1 MiB each; only hashes and paths are retained. Traversal and links resolving outside that directory are rejected.
- Inspection checks Git HEAD/status and the selected file hashes. Dirty work always requires review because unchanged Git status does not prove unchanged contents. Ignored files, dependencies and external systems remain outside these checks.
- Adoption protects existing destination progress unless `replace=true` is explicitly selected. Imported completed-work claims are retained as historical reports; the destination completed list starts empty. Inspect drift and reconcile unfinished side effects before executing next actions.
- The latest 20 handoffs per project are retained, with a 12,000-character limit per snapshot. Older handoffs are replaced as new ones are created. Cross-project adoption is rejected; no work executes automatically.

Automatic diagnostics continue to report continuity evidence even if Python is unavailable. Cleanup releases every registration after individual failures, and a partial setup failure releases earlier registrations. Empty-store checks scan directory entries incrementally instead of allocating an entire filename list.

### Resource use and recovery in 0.3

- The server uses the SDK's public TypeScript contract without bundling a second runtime schema library.
- Empty memory stores start no Python bridge. When eligible stores exist, project and personal recall share one short-lived bridge per request; no persistent worker, polling loop, embedding service or graph database is started.
- Personal and project results share the same 3,500-character limit using interleaved per-scope rankings. Recall preserves available origin, approval, revision, freshness and unresolved-status metadata.
- Continuity storage opens lazily on first use. Tool start/outcome observations are saved automatically, including a bounded list of unfinished parallel calls. New workflow plans create an initial checkpoint if one is missing; explicit checkpoints are preserved.
- Recovery notes describe observations, not verified completion. An unfinished call might have affected an external system: inspect its outcome before retrying. Large pending lists are summarized in context and remain available through `/uranium-status`.
- Memory responses are bounded and Python jobs are cancellable with a 60-second limit. Failed automatic continuity storage is reported without preventing ordinary OpenCode work; explicit checkpoint writes still report failure. Diagnose the storage problem and reload before relying on continuity again.

This release adds no automatic model calls. Temporary query text is bounded in memory rather than persisted as conversation history. The receipt feed remains bounded and is not a full durable workflow scheduler.

The included, hash-pinned OMH pure-Python wheel supplies the memory engine. Normal memory operations import directly from the archive; native maintenance commands use a guarded per-user extraction cache. See [engine provenance](engine/README.md) and [license notices](NOTICE.md).

Memory candidates always require operator review. The model-facing `uranium_memory` tool cannot approve them. Only approved, eligible records enter automatic recall, with a final **3,500-character context budget**. Project identity follows canonical repository roots and linked worktrees; separate clones keep separate stores. Outside Git, the canonical directory is the project identity. Personal memory is tied to the local OS user, not remote authentication.

Default data locations:

| Platform | Directory |
| --- | --- |
| Windows | `%LOCALAPPDATA%/Uranium` |
| Linux | `$XDG_DATA_HOME/uranium`, or `~/.local/share/uranium` |
| macOS | `~/Library/Application Support/Uranium` |

Override `URANIUM_HOME` for data, `URANIUM_MEMORY_PYTHON` for a Python executable, or `URANIUM_ENGINE_CACHE` for the extraction cache. Existing Hermes data is not read or migrated. The plugin does not persist raw transcripts; concise memory summaries and structured checkpoints are persisted locally. Obvious credential/instruction-shaped capture checks reduce risk, but are not a guarantee against every secret or prompt injection. Recalled content remains historical data, not execution authority.

Terminal access:

```sh
uranium memory capture "This project uses SQLite WAL mode."
uranium memory review
uranium memory approve <candidate-id> <review-revision>
uranium memory recall "database journaling"
uranium memory native --help
```

Use `memory native` for the existing engine's correction, retirement, retention, provenance and consolidation diagnostics. Use the scoped adapter commands above instead of native capture/recall. `memory native dream` reports consolidation readiness; it does not silently consolidate knowledge. Context hooks fail gracefully when Python or memory is unavailable.

## Boundaries

OpenCode owns coding tools, sessions, providers, permissions, compaction and model execution. Uranium supplies additional state and policy. It does **not** port OMH's full parallel scheduler, every Hermes-specific skill or every ultra-workflow engine. Workflow declarations are not a filesystem sandbox, and a completed tool invocation is not a correctness verdict. The model must use checkpoints and run meaningful verification; no speed, cost or model-quality advantage is claimed.

The green theme uses compact native branding. The old Hermes frontend and its large PNG/striped banner are not part of this plugin. Koi animation and controls belong to whichever optional koi plugin you choose.

## Development and checks

```sh
bun install --frozen-lockfile
bun run check
bun run build
bun test
npm run pack:check
```

Package checks install the actual tarball into a temporary consumer, run the Node CLI and bundled memory engine, check reviewed recall, preserve JSONC comments/plugins, and verify koi is absent by default and added only by explicit selection. CI targets Windows, Linux and macOS, including a native OpenCode host check.

For the optional native-host check, set `OPENCODE_BIN` to the OpenCode 2.2.1 executable and run `bun scripts/host-smoke.ts` after building. It uses a dummy local model and deliberately stops before inference; it proves real context-hook delivery, not model quality. No automated check calls a paid model.

## Remove or recover

Remove Uranium's entry from OpenCode's `plugins` array and select another theme, then restart OpenCode. Setup backups live under the chosen config directory's `backups/uranium-*`. Uninstalling the npm package does not delete memory. Delete or archive the data directory separately only when you intend to remove your saved knowledge.

## License

[MIT](LICENSE). Original OMH, OpenCode, Effect and jsonc-parser notices are retained. Koi remains a separate project with its own provenance and terms.
