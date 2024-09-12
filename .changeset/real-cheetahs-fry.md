---
"@cloudflare/workers-shared": minor
---

Add asset config behaviour.

Add `html_handling` (e.g. /index.html -> /) with options `"auto-trailing-slash" | "force-trailing-slash" | "drop-trailing-slash" | "none"` to Asset Worker.

Add `not_found_handling` behaviour with options `"404-page" | "single-page-application" | "none"` to Asset Worker.
