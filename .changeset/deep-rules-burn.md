---
"wrangler": patch
---

Migrate wrangler dev to use Miniflare dev registry implementation

Updated `wrangler dev` to use a shared dev registry implementation that now powers both the Cloudflare Vite plugin and Wrangler. This internal refactoring has no user-facing changes but consolidates registry logic for better consistency across tools.
