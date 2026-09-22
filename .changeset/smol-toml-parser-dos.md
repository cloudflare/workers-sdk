---
"wrangler": patch
"create-cloudflare": patch
"@cloudflare/workers-utils": patch
"@cloudflare/workers-auth": patch
---

Update `smol-toml` to 1.8.0

This updates the bundled TOML parser that reads `wrangler.toml` to a version that addresses two advisories against 1.5.2: `GHSA-7w5x-hrqm-74c2` (a value followed by a comment with no trailing newline, such as `a=[1 #`, put the parser in an infinite loop) and `GHSA-v3rj-xjv7-4jmq` (thousands of consecutive comment lines overflowed the stack). On the old version, `wrangler deploy` against a `wrangler.toml` ending in `a=[1 #` never returned; it now fails with `Invalid TOML document: cannot find end of structure`.
