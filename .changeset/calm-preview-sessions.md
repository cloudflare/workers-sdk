---
"@cloudflare/remote-bindings": patch
"wrangler": patch
---

Keep remote preview tokens fresh throughout long-running development sessions

Reloading a Worker no longer postpones token refresh beyond the preview session's lifetime. Failed refreshes are retried with backoff so remote bindings can recover without restarting the development server.
