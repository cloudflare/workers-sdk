---
"@cloudflare/vite-plugin": patch
---

Set `ignoreOutdatedRequests` to `true` in `optimizeDeps` config.

This is a workaround for https://github.com/vitejs/vite/issues/20867 and will resolve `Error: There is a new version of the pre-bundle for ...` errors that some users are experiencing. The longer term solution is to use full-bundle mode rather than `optimizeDeps` once it is supported for server environments. Vite v7.3.1 or above is needed for this change to take effect.
