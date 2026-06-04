---
"wrangler": minor
---

Add an experimental `cf-wrangler` delegate entrypoint for projects that can't use `@cloudflare/vite-plugin` (service workers, old compatibility dates, Python, Rust, etc.).

`cf-wrangler dev` starts the same local dev server as `wrangler dev` — it sits directly on wrangler's internal dev server, so the bundling and runtime behaviour are identical — but exposes a deliberately narrow CLI surface (`--mode`, `--port`, `--host`, `--local`) for a parent CLI to delegate to. The wrangler config file is found via wrangler's standard discovery, and everything else is configured in `wrangler.json`. This replaces the separate `@cloudflare/wrangler-bundler` package. This is an internal integration point and is not intended to be run directly by users.
