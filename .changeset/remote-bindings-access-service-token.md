---
"miniflare": patch
"wrangler": patch
---

Authenticate remote binding traffic with Cloudflare Access

When `wrangler dev` (or the Vite plugin) uses remote bindings against a Worker whose `workers.dev` domain is protected by Cloudflare Access, requests from the local proxy client to the remote proxy server were rejected with a 401/403 — breaking AI, Vectorize, Images, Artifacts, and other remote bindings.

Wrangler now resolves the Access headers for the proxy server's host via the canonical `getAccessHeaders()` helper (the same one the realish-preview hop already uses) and carries them on the remote proxy connection string, so Miniflare attaches them to the binding traffic:

- **HTTP path (`makeFetch`)** — wrapped-fetcher bindings such as AI, Vectorize, and Images send the headers to the proxy server.
- **WebSocket/capnweb path (`makeRemoteProxyStub`)** — RPC bindings such as Artifacts establish the capnweb WebSocket through a custom transport that performs a `fetch()` upgrade (`Upgrade: websocket`), so the headers are included in the handshake — `new WebSocket(url)` cannot set request headers in the Workers runtime.

Because the headers come from `getAccessHeaders()`, both Access service tokens (`CLOUDFLARE_ACCESS_CLIENT_ID` / `CLOUDFLARE_ACCESS_CLIENT_SECRET`) and interactive `cloudflared access login` cookie auth are supported, and the credentials travel per-session so multiworker dev stays correct when different workers target different Access-protected hosts. When the host is not behind Access, behaviour is unchanged.
