---
"@cloudflare/autoconfig": patch
"create-cloudflare": patch
"wrangler": patch
---

Stop adding a redundant `nodejs_compat` flag to generated Wrangler configurations

`create-cloudflare` and `wrangler setup` write today's date as the `compatibility_date`, and from `2026-08-04` that already enables `nodejs_compat`. Adding the flag as well made the generated project fail to start with "The compatibility flag nodejs_compat became the default as of 2026-08-04 so does not need to be specified anymore", so the flag is now only added for earlier compatibility dates.
