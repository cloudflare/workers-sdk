---
"wrangler": patch
"create-cloudflare": patch
"@cloudflare/workers-utils": patch
"@cloudflare/workers-auth": patch
---

Update `smol-toml` to 1.9.0 to fix slow parsing of very large TOML files

Parse time for TOML config files now grows linearly with their size, instead of with its square: a 40,000-line file that took 259 ms to parse now takes 17 ms, while typical `wrangler.toml` files parse in the same time as before. This addresses the `GHSA-r4xh-jqrq-34v2` advisory against earlier versions of the parser.

Some TOML syntax errors now point at the character that caused them. For example, a `wrangler.toml` containing `INVALID "FILE` is now reported as `illegal character in key` at the `"`, rather than `incomplete key-value` at the start of the line.
