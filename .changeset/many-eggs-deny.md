---
"wrangler": patch
---

fix: pages advanced mode usage

Previously in pages projects using advanced mode (a single `_worker.js` or `--script-path` file rather than a `./functions` folder), calling `pages dev` would quit without an error and not launch miniflare.

This change fixes that and enables `pages dev` to be used with pages projects in advanced mode.
