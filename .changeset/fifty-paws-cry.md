---
"wrangler": patch
---

feat: publish full url on `wrangler publish` for workers.dev workers

When the url is printed out on `wrangler publish`, the full url is printed out so that it can be accessed from the terminal easily by doing cmd+click. Implemented only for workers.dev workers.

Resolves https://github.com/cloudflare/wrangler2/issues/1530
