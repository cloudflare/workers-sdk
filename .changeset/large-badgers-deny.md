---
"create-cloudflare": minor
---

Output wrangler.jsonc instead of wrangler.json

The JSONC format allows comments, but otherwise uses standard JSON syntax.

Note that Wrangler is still happy to parse `.json` files with comments (along the lines of `tsconfig.json`), but to prevent confusion and for default compatibility with all IDEs, create-cloudflare will now output `wrangler.jsonc`.
