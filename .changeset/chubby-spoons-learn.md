---
"miniflare": patch
"wrangler": patch
---

Fix scheduled trigger warning showing `undefined` port

When running `wrangler dev` with a worker that has cron triggers, the warning message displayed an invalid URL like `curl "http://localhost:undefined/cdn-cgi/handler/scheduled"` because the port wasn't yet determined when the warning was logged.

Moved the warning to after the proxy server is fully ready, where the actual public URL and port are known.
