---
"wrangler": patch
---

fix: disable local persistence by default & add `--experimental-enable-local-persistence` flag

BREAKING CHANGE:

When running `dev` locally any data stored in KV, Durable Objects or the cache are no longer persisted between sessions by default.

To turn this back on add the `--experimental-enable-local-persistence` at the command line.
