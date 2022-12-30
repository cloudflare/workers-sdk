---
"wrangler": minor
---

feat: promote dev API to stable

BREAKING CHANGE

The following functions and types have been promoted to stable:

- `unstable_dev` API is now `dev`.
- `UnstableDevWorker` is now `DevWorker`.
- `UnstableDevOptions` is now `DevOptions`.
- `disableExperimentalWarning` has been removed as an experimental option to `dev`.
