---
"wrangler": patch
---

fix: Upload Pages project assets with more grace

- Reduces the maximum bucket size from 50 MiB to 40 MiB.
- Reduces the maximum asset count from 5000 to 2000.
- Allows for more retries (with increased sleep between attempts) when encountering an API gateway failure.
