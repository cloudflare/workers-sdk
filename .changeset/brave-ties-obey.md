---
"wrangler": patch
---

chore: add `env` and `ctx` params to `fetch` in javascript example template

Just like in the typescript templates, and the javascript template for scheduled workers, we include `env` and `ctx` as parameters to the `fetch` export. This makes it clearer where environment variables live.
