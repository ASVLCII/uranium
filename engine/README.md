# Bundled memory engine

`oh_my_hermes-4.0.3+uranium.3-py3-none-any.whl` is a pure-Python source wheel derived from [rlaope/oh-my-hermes](https://github.com/rlaope/oh-my-hermes), upstream version 4.0.3, commit `bbf278ab3c44e0838844201406c4f4f66c1f3a2a`, with the existing Uranium Windows adaptations.

SHA-256: `0c52f6916f08b30a18acfc00258bc17c6293e5e8a04b44d06bb740f8eeb1e77c`.

The archive includes Python source and upstream license metadata; it contains no Python interpreter, native binary, user configuration, credentials or memory records. A wheel is a standard ZIP archive and can be inspected with ordinary ZIP tools. The original MIT notice is also retained in `assets/LICENSE.oh-my-hermes`.

The bridge verifies the hash and imports normal memory operations directly from the source archive. Native maintenance commands extract the same engine into a per-user cache because some CLI commands need real resource paths. Python 3.11+ is a prerequisite. No pip, dependency downloads, Hermes startup, or pre-existing OMH installation is used. A short initialization lock protects concurrent extraction; directory rename is used where available, with a locked copy fallback for redirected Windows directories.
