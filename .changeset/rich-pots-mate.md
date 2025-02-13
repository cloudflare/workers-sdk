---
"wrangler": minor
---

Add `--outfile` to `wrangler deploy` for generating a worker bundle.

This is an advanced feature that most users won't need to use. When set, Wrangler will output your built Worker bundle in a Cloudflare specific format that captures all information needed to deploy a Worker using the [Worker Upload API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/)
