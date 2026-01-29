---
"wrangler": patch
---

Preserve port in Origin and Referer headers when using `--host` flag

Previously, when using `wrangler dev --host <hostname>`, the port was stripped from the `Origin` and `Referer` headers, causing issues with CORS validation and authentication workflows that rely on accurate origin headers. For example, `Origin: http://localhost:4000` would become `Origin: http://localhost`.

This fix removes the explicit port clearing logic, allowing the port from the original request URL to be preserved correctly.
