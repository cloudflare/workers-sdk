---
"miniflare": minor
---

Serve local static assets with workerd's native assets service

Local Workers with `assets` are now served by workerd's `assets` service, which routes each request to the User Worker or to a file as Cloudflare does, and sends the User Worker every other event (RPC, scheduled, tail). It reads files from the assets directory as requests arrive, so Miniflare no longer walks the directory to build a manifest at startup, and files added or changed while it runs are served at once. `_headers`, `_redirects`, `.assetsignore`, `html_handling`, `not_found_handling`, `base_path` and `run_worker_first` behave as before.

Miniflare no longer checks the asset count and size limits locally; `wrangler deploy` still does.
