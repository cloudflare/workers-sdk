---
"wrangler": patch
---

Fix Access Service Token authentication for applications that only allow service tokens

When using remote bindings against a Worker behind a Cloudflare Access application configured to only allow Service Auth tokens (no interactive user authentication), Wrangler previously ignored the `CLOUDFLARE_ACCESS_CLIENT_ID` and `CLOUDFLARE_ACCESS_CLIENT_SECRET` environment variables and the request would fail with a 403.

This happened because Wrangler detects Access by looking for a 302 redirect to `cloudflareaccess.com`. A service-auth-only Access application has no interactive login path, so it responds with a hard 403 instead of redirecting. Wrangler concluded the domain was not behind Access and skipped attaching the service token headers entirely.

The env-var check now runs before the Access detection step, so the configured service token credentials are always used when present.
