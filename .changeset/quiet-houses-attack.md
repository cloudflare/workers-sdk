---
"miniflare": minor
---

Fix Hyperdrive binding issue where some customers are unable to connect to local databases using `wrangler dev`

- Skips creating a local TCP proxy server for Hyperdrive bindings when SSL is not enabled, connecting directly to the database instead. This avoids connection refused errors caused by firewall rules or proxy port binding issues on Windows/macOS.
