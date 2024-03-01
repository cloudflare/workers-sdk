---
"miniflare": patch
---

fix: ensure internals can access `workerd` when starting on non-local `host`

Previously, if Miniflare was configured to start on a `host` that wasn't `127.0.0.1`, `::1`, `*`, `::`, or `0.0.0.0`, calls to `Miniflare` API methods relying on the magic proxy (e.g. `getKVNamespace()`, `getWorker()`, etc.) would fail. This change ensures `workerd` is always accessible to Miniflare's internals. This also fixes `wrangler dev` when using local network address such as `192.168.0.10` with the `--ip` flag.
