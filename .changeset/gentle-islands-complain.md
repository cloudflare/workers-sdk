---
"wrangler": patch
---

feat: `--local` mode only applies in `wrangler dev`

We'd originally planned for `--local` mode to be a thing across all wrangler commands. In hindsight, that didn't make much sense, since every command other than `wrangler dev` assumes some interaction with cloudflare and their API. The only command other than dev where this "worked" was `kv`, but even that didn't make sense because wrangler dev wouldn't even read from it. We also have `--experimental-enable-local-persistence` there anyway.

So this moves the `--local` flag to only apply for `wrangler dev` and removes any trace from other commands.
