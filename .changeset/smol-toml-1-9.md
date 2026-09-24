---
"wrangler": patch
"create-cloudflare": patch
"@cloudflare/workers-utils": patch
"@cloudflare/workers-auth": patch
---

Update `smol-toml` to 1.9.0

This updates the bundled TOML parser that reads `wrangler.toml` to a version that addresses `GHSA-r4xh-jqrq-34v2`, which affects every version up to and including 1.8.0: parse time grew quadratically with the number of key lines, so a 40,000-line document took 259 ms on 1.8.0 and takes 17 ms on 1.9.0. Some TOML syntax errors now point at the offending character; for example, `INVALID "FILE` is reported as `illegal character in key` at column 8 instead of `incomplete key-value` at column 0.
