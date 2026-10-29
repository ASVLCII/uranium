# Uranium

**Reviewed long-term memory, resumable checkpoints and scoped workflows for OpenCode.**

Uranium is an MIT-licensed OpenCode plugin. It adds a durable memory layer using the OMH engine, native memory-review dialogs, task checkpoints, workflow validation and four focused workflow skills. A radioactive green theme is included.

**Koi is not bundled, required or installed.** Existing koi installations can stay in place; adding one is an explicit optional step.

## Install from GitHub using npm

Requirements: **OpenCode 2.2.1**, **Node.js 22+** for the setup CLI, and **Python 3.11+** available as `python` on Windows or `python3` elsewhere. OpenCode supplies Bun and the terminal renderer for the plugin itself. Python's standard library is enough; Hermes, pip and an existing OMH installation are unnecessary.

```sh
npm install -g github:ASVLCII/uranium#v0.2.0
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

## Memory and data

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

Package checks install the actual tarball into a temporary consumer, run the Node CLI and bundled memory engine, check reviewed recall, preserve JSONC comments/plugins, and verify koi is absent by default and added only by explicit selection. CI runs these checks on Windows and Linux.

For the optional native-host check, set `OPENCODE_BIN` to the OpenCode 2.2.1 executable and run `bun scripts/host-smoke.ts` after building. It uses a dummy local model and deliberately stops before inference; it proves real context-hook delivery, not model quality. No automated check calls a paid model.

## Remove or recover

Remove Uranium's entry from OpenCode's `plugins` array and select another theme, then restart OpenCode. Setup backups live under the chosen config directory's `backups/uranium-*`. Uninstalling the npm package does not delete memory. Delete or archive the data directory separately only when you intend to remove your saved knowledge.

## License

[MIT](LICENSE). Original OMH, OpenCode, Effect and jsonc-parser notices are retained. Koi remains a separate project with its own provenance and terms.
