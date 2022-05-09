---
"wrangler": patch
---

fix: support Windows line-endings in TOML files

The TOML parser that Wrangler uses crashes if there is a Windows line-ending in a comment.
See https://github.com/iarna/iarna-toml/issues/33.

According to the TOML spec, we should be able to normalize line-endings as we see fit.
See https://toml.io/en/v1.0.0#:~:text=normalize%20newline%20to%20whatever%20makes%20sense.

This change normalizes line-endings of TOML strings before parsing to avoid hitting this bug.

Fixes https://github.com/cloudflare/wrangler2/issues/915
