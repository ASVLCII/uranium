# Attribution

Uranium's OpenCode adapter is MIT licensed, copyright 2026 ASVLCII.

The bundled pure-Python memory engine is oh-my-hermes 4.0.3+uranium.3, derived from rlaope/oh-my-hermes. Its original MIT notice is retained in assets/LICENSE.oh-my-hermes and inside the wheel. Provenance and the pinned checksum are documented in engine/README.md. No installed Hermes environment is required or started.

OpenCode 2.2.1 and its plugin/theme packages are upstream MIT software by their respective contributors. They remain separate dependencies with their original licenses. Uranium does not claim ownership of upstream OpenCode or Hermes work.

Koi is an optional separate integration, such as ASVLCII/opencode-pond. It is not a dependency, is not bundled, and is not installed by Uranium. Existing plugins are preserved during explicit setup; a koi entry is added only if the operator passes --koi.

The server bundle contains portions of the MIT-licensed Effect library. Its notice is retained in assets/LICENSE.effect. The configuration helper contains MIT-licensed jsonc-parser code; its notice is retained in assets/LICENSE.jsonc-parser. The standalone CLI also depends on jsonc-parser, which retains its own package license.

The radiation PNG was derived for the user's Uranium project from their supplied radiation ASCII reference. It is retained here as the existing approved asset.
