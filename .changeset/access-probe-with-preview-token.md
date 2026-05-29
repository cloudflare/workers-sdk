---
"wrangler": patch
---

Fix `wrangler dev` redirect loop when a wildcard Cloudflare Access app covers an unpublished worker's `workers.dev` subdomain

When `wrangler dev` uses remote bindings, it deploys an edge-preview version of your worker at `<name>.<subdomain>.workers.dev` and proxies local traffic to it. Before this fix, the Access detection probe only sent an anonymous `GET https://<host>/`. For an unpublished worker, that hostname has no public route at the edge yet — so the probe returned `404`, wrangler concluded "not behind Access," and skipped attaching a `CF_Authorization` cookie. The actual preview-token traffic later _did_ trigger Access (the wildcard app matched once the preview route was activated by the `cf-workers-preview-token` header), producing a 302 redirect loop with no clear error.

The probe now forwards `cf-workers-preview-token` along with the request, which activates the edge-preview route and lets Access respond with its expected 302. The cached probe result is keyed separately when probe headers are supplied so anonymous and token-authenticated results don't poison each other.

`cloudflared access login` is invoked with the same headers (via the new `--header` flag added in `cloudflared` 2025.x) so its own discovery probe works on unpublished hostnames too. A new `WRANGLER_CLOUDFLARED_BINARY` environment variable lets you point at a custom `cloudflared` build if needed.
