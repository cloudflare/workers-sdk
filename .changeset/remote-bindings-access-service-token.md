---
"miniflare": patch
---

Authenticate remote binding requests with Cloudflare Access service tokens

When `wrangler dev` (or the Vite plugin) uses remote bindings against a Worker whose `workers.dev` domain is protected by Cloudflare Access, requests from the local proxy client to the remote proxy server were rejected with a 401/403 — breaking AI, Vectorize, Images, Artifacts, and other remote bindings.

If `CLOUDFLARE_ACCESS_CLIENT_ID` and `CLOUDFLARE_ACCESS_CLIENT_SECRET` are set (the same Service Token env vars already used by `getAccessHeaders()` for the realish-preview HTTP path), they are now attached to remote-binding traffic:

- **HTTP path (`makeFetch`)** — wrapped-fetcher bindings such as AI, Vectorize, and Images now send `CF-Access-Client-Id` / `CF-Access-Client-Secret` headers to the proxy server.
- **WebSocket/capnweb path (`makeRemoteProxyStub`)** — RPC bindings such as Artifacts now establish the capnweb WebSocket via a `fetch()` upgrade (`Upgrade: websocket`) so the Access headers are included in the handshake, since `new WebSocket(url)` cannot set request headers in the Workers runtime.

Without service token credentials, behaviour is unchanged.
