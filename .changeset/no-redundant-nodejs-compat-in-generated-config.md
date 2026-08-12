---
"@cloudflare/autoconfig": patch
"create-cloudflare": patch
"wrangler": patch
---

Stop adding a redundant `nodejs_compat` flag to generated Wrangler configurations

`create-cloudflare` and `wrangler setup` write today's date as the `compatibility_date`, and from `2026-08-04` that already enables `nodejs_compat`. Adding the flag as well made the generated project fail to start with "The compatibility flag nodejs_compat became the default as of 2026-08-04 so does not need to be specified anymore", so the flag is now only added for earlier compatibility dates.

`create-cloudflare` also removes the flag when a template, or a framework's own scaffolder, already wrote it into a configuration that ends up using such a compatibility date, and still installs `@types/node` for these projects even though there is no longer a flag to detect them by.

`wrangler setup` does the same for a `wrangler.json(c)` that is already in the project: it writes today's date over whatever date that configuration was written for, so a `nodejs_compat` it finds there is removed as part of writing the file.
