---
"miniflare": minor
"wrangler": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/workers-utils": minor
---

Add local development support for `/cdn-cgi/image/` URL transformations

When `images.url_transformations` (or `images.urlTransformations` in `cloudflare.config.ts`) is enabled, Miniflare now handles `/cdn-cgi/image/<options>/<source>` requests locally before they reach your Worker. Requests return a 404 when URL transformations are not enabled for the Worker (including when the setting is unset, as there is no zone setting to fall back to locally), and a 403 when the source image isn't allowed. Without `allowed_origins`, images must come from the same host as the request, as there is no zone locally. With `allowed_origins`, the listed origins are allowed, and the Worker's own host is always allowed too, so `localhost` doesn't need to be listed. Transforms use the same low-fidelity Sharp-backed mock as `cf.image` fetches, so only resize, rotate, format conversion and a small set of options are applied.

This is a change in behaviour: previously `/cdn-cgi/image/` requests were passed through to the Worker during local development.

Requests made through `SELF` in `@cloudflare/vitest-plugin` bypass Miniflare's routing and are not intercepted.
