---
"miniflare": patch
---

Fix `wrangler dev` crash when using a Flagship binding with `remote: true`

In remote mode, the flagship binding is backed by a generic proxy worker that only has a default export. The plugin was requesting a named entrypoint `"FlagshipBinding"` which doesn't exist on it, causing workerd to reject the binding at startup. The named entrypoint is now omitted in remote mode so workerd routes to the default export, which correctly proxies all RPC calls to the remote Flagship service.
