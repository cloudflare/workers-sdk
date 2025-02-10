---
"wrangler": patch
---

fix: Fix wrangler config file detection edge case. Previously, a folder containing wrangler.json, and a subfolder containing wrangler.toml would actually detect the top-level wrangler.json due to the order they were checked.
