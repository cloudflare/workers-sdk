---
"wrangler": patch
---

Fix `wrangler dev` corrupting external hostnames in proxied response headers

When a Worker was run with `routes` configured, `wrangler dev`'s proxy rewrote the host inside URL-valued headers (such as `Location`) using a boundary-less substring replace. Any host that merely _contained_ the route host as a substring was corrupted — e.g. with an `example.com` route, a `Location: https://books.example.com/read/ch01` header became `https://books.127.0.0.1:8788/read/ch01`, and `https://myexample.com/path` became `https://my127.0.0.1:8788/path`.

The proxy now only rewrites absolute URLs whose host is exactly the proxied host, swapping the scheme and host together (which also fixes a related case where an `https:` scheme survived on a plain-HTTP dev address). Unrelated hosts and subdomains pass through untouched.
