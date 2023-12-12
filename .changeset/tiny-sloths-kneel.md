---
"miniflare": patch
---

fix: include request url and headers in pretty error page

This change ensures Miniflare's pretty error page includes the URL and headers of the incoming request, rather than Miniflare's internal request for the page.
