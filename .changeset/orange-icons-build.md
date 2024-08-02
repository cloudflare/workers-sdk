---
"@cloudflare/workers-shared": minor
"wrangler": minor
---

feat: Create very basic Asset Server Worker and plumb it into `wrangler dev`

These changes do the ground work needed in order to add Assets support for Workers in `wrangler dev`. They implement the following:

- it creates a new package called `workers-shared` that hosts the `Asset Server Worker`, and the `Router Worker`in the future
- it scaffolds the `Asset Server Worker` in some very basic form, with basic configuration. Further behaviour implementation will follow in a subsequent PR
- it does the ground work of plumbing ASW into Miniflare
