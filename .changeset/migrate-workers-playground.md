---
"@cloudflare/workers-playground": patch
"@cloudflare/playground-preview-worker": patch
---

Migrate workers-playground from Cloudflare Pages to Cloudflare Workers

Replace the Cloudflare Pages deployment with a Workers + static assets deployment.

In production (`wrangler.jsonc`), this is an assets-only Worker with no code entry point — the `playground-preview-worker` handles all routing and proxying in front of it.

For local development, a separate config (`wrangler.dev.jsonc`) adds a Worker entry point (`src/worker.ts`) that replicates the proxying behavior of the production `playground-preview-worker`. It proxies `/playground/api/*` requests to the testing `playground-preview-worker`, and for the `/playground` route it fetches an auth cookie from the testing endpoint, transforms it for local use (stripping `SameSite`/`Secure` directives and replacing the testing origin with `localhost`), and injects it into the response so the preview iframe can authenticate.

The `playground-preview-worker` referer allowlist is updated to also accept requests from `*.workers-playground.workers.dev` (in addition to the existing `*.workers-playground.pages.dev`).
