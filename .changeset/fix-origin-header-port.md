---
"wrangler": patch
---

Preserve port in Origin and Referer headers when using `--host` flag

Previously, when using `wrangler dev --host <hostname:port>`, the port was not correctly handled, causing issues with CORS validation and response header rewriting. For example, `--host localhost:4000` would not properly preserve the port in request/response headers.

This fix adds support for parsing the port from the `--host` and `--local-upstream` flags, ensuring that the worker sees the correct URL with the specified port and that response headers are correctly rewritten back to the local proxy address.
