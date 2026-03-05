---
"@cloudflare/workers-playground": patch
"@cloudflare/playground-preview-worker": patch
---

Migrate workers-playground from Cloudflare Pages to Cloudflare Workers

Replace the Cloudflare Pages deployment with a Workers + static assets deployment. In production, the Worker serves assets only. For local development, a dev environment adds a Worker entry point that proxies API calls to the playground-preview-worker. The playground-preview-worker referer allowlist is updated to accept requests from .workers.dev domains.
