---
"wrangler": patch
---

fix: wrangler init --from-dash incorrectly expects index.ts while writing index.js

This PR fixes a bug where Wrangler would write a `wrangler.toml` expecting an index.ts file, while writing an index.js file.
