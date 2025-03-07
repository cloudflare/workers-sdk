---
"@cloudflare/workers-shared": minor
---

Add `CF-Cache-Status` to Workers Assets responses to indicate if we returned a cached asset or not. This will also populate zone cache analytics and Logpush logs.
