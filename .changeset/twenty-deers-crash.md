---
"wrangler": patch
---

fix: we no longer infer pathnames from route patterns as the host

During local development, inside your worker, the host of `request.url` is inferred from the `routes` in your config.

Previously, route patterns like "\*/some/path/name" would infer the host as "some". We now handle this case and determine we cannot infer a host from such patterns.
