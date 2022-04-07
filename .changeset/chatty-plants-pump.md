---
"wrangler": patch
---

fix: use cwd for `--experiment-enable-local-persistence`

This sets up `--experiment-enable-local-persistence` to explicitly use `process.cwd() + wrangler-local-state` as a path to store values. Without it, local mode uses the temp dir that we use to bundle the worker, which gets wiped out on ending wrangler dev. In the future, based on usage, we may want to make the path configurable as well.

Fixes https://github.com/cloudflare/wrangler2/issues/766
