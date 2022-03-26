---
"wrangler": patch
---

fix: unexpected commands and arguments should throw

This enables strict mode in our command line parser (yargs), so that unexpected commands and options uniformly throw errors.

Fixes https://github.com/cloudflare/wrangler2/issues/706
