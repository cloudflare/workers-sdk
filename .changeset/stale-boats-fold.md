---
"miniflare": minor
"wrangler": minor
---

feat: add static routing options via 'run_worker_first' to Wrangler

Implements the proposal noted here https://github.com/cloudflare/workers-sdk/discussions/9143.

This is now usable in `wrangler dev` and in production - just specify the routes that should hit the worker first with `run_worker_first` in your Wrangler config. You can also omit certain paths with `!` negative rules.
