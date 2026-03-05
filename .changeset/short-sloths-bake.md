---
"@cloudflare/workers-shared": patch
---

fix: Normalize backslash characters in `/cdn-cgi` paths

Requests containing backslash characters in `/cdn-cgi` paths are now redirected to their normalized equivalents with forward slashes. This ensures consistent URL handling across different browsers and HTTP clients.
