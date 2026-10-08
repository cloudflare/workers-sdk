---
"wrangler": minor
---

Add an `--infer-origin-from-routes` flag to `wrangler dev`

When a config has `routes`, local dev infers the origin from the first route, so the Worker sees `request.url`, the `Host` header, and any `Origin` header rewritten to the route's host even though the client connected to `localhost`. That silently breaks Host/Origin-sensitive logic — for example a CORS check allowlisting `http://localhost:*` receives `http://<route-host>` instead and rejects the request only in local dev.

The inference is intentional and remains the default. Passing `--infer-origin-from-routes=false` now opts out, preserving the real local origin without removing `routes` from the config. An explicitly configured `--host`, `--local-upstream`, or `dev.host` continues to take precedence either way. The flag only affects local development: in remote mode the route host still determines the preview session as before.
