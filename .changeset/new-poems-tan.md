---
"wrangler": patch
---

fix: export durable objects correctly when using `--assets`

The facade for static assets doesn't export any exports from the entry point, meaning Durable Objects will fail. This fix adds all exports to the facade's exports.
