---
"wrangler": patch
---

fix: keep configuration watcher alive

Ensure `wrangler dev` watches the `wrangler.toml` file and reloads the server whenever configuration (e.g. KV namespaces, compatibility dates, etc) changes.
