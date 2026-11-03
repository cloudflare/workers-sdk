---
"miniflare": patch
"wrangler": patch
---

Report Cloudflare Access login redirects on remote bindings instead of looping until "Too many redirects"

When a remote bindings request reached a `workers.dev` host protected by Access without valid Access credentials (for example, Access was added after the dev server started, the `CF_Authorization` cookie expired, or Access was not detected at startup), the edge redirected it to the Access login page. The binding followed that redirect back through the remote proxy, looping until it failed with `TypeError: Too many redirects` and an error message containing the Access login URL. Miniflare now detects the redirect, returns a readable 401 explaining how to re-authenticate, and logs the existing one-time "Cloudflare Access blocked a remote bindings request" warning.

The remote proxy server now marks the responses it forwards from a binding, so only Access responses generated in front of it are replaced. An Access login redirect or block page returned by a remote binding itself (for example, a Worker proxying an Access-protected origin) now reaches the caller unchanged.
