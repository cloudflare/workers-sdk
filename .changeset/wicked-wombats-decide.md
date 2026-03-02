---
"@cloudflare/vitest-pool-workers": patch
---

Fix resource leak where remote proxy sessions were not disposed during pool shutdown, causing vitest processes to hang.
