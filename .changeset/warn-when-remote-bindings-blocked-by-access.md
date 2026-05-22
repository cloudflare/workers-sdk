---
"miniflare": patch
"wrangler": patch
---

Warn when a remote-bindings request is blocked by Cloudflare Access

When `wrangler dev` is used with remote bindings and a request from the local remote-bindings proxy client to the remote workers.dev proxy server is blocked by Cloudflare Access (HTTP 403 with the Cloudflare Access block page), Wrangler now:

- Logs a single, visually striking warning per dev session explaining how to set `CLOUDFLARE_ACCESS_CLIENT_ID` / `CLOUDFLARE_ACCESS_CLIENT_SECRET` (Service Token credentials) or run `cloudflared access login` to authenticate.
- Replaces the original Access HTML block page with a readable plain-text body containing the same guidance, so the message also reaches the user via binding error messages (e.g. `InferenceUpstreamError` from `env.AI.run()`) and any browser response piped back via a service binding `.fetch()`.

Previously the 403 was returned to user code with the full Access HTML, which both drowned out other logs and made it hard to tell that the failure was due to Cloudflare Access on workers.dev rather than a problem in the binding itself or the deployed proxy server. The detection runs inside the proxy client worker (which only ever talks to the remote-bindings proxy URL), so it does not trigger false positives on user-worker 403s.
