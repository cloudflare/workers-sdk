---
"wrangler": patch
---

Fix `wrangler setup` not automatically selecting `workers` as the target for new SvelteKit apps

The Sveltekit `adapter:cloudflare` adapter now accepts two different targets `workers` or `pages`. Since the wrangler auto configuration only targets workers, wrangler should instruct the adapter to use the `workers` variant. (The auto configuration process would in any case not work if the user were to target `pages`.)
