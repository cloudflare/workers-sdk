---
"wrangler": patch
---

polish: do not log the error object when refreshing a token fails

We handle the error anyway (by doing a fresh login) which has its own logging and messaging. In the future we should add a DEBUG mode that logs all requests/errors/warnings, but that's for later.
