---
"wrangler": patch
---

Stop proxying localhost requests when proxy environment variables are set

When `HTTP_PROXY` or `HTTPS_PROXY` is configured, all fetch requests including ones to `localhost` were routed through the proxy. This caused `wrangler dev` and the Vite plugin to fail with "TypeError: fetch failed" because the proxy can't reach local addresses.

This switches from `ProxyAgent` to undici's `EnvHttpProxyAgent`, which supports the `NO_PROXY` environment variable. When `NO_PROXY` is not set, it defaults to `localhost,127.0.0.1,::1` so local requests are never proxied.

The `NO_PROXY` config only applies to the request destination, not the proxy server address. So a proxy running on localhost (e.g. HTTP_PROXY=http://127.0.0.1:11451) still works for outbound API calls.
