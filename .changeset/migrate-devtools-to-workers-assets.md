---
"@cloudflare/chrome-devtools-patches": patch
"wrangler": patch
"miniflare": patch
---

Migrate chrome-devtools-patches deployment from Cloudflare Pages to Workers + Assets

The DevTools frontend is now deployed as a Cloudflare Workers + Assets project instead of a Cloudflare Pages project. This uses `wrangler deploy` for production deployments and `wrangler versions upload` for PR preview deployments.

The inspector proxy origin allowlists in both wrangler and miniflare have been updated to accept connections from the new `workers.dev` domain patterns, while retaining the legacy `pages.dev` patterns for backward compatibility.
