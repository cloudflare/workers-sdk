---
"wrangler": patch
---

feat: add support for `--ip` and `config.dev.ip` in the dev command

Note that this change modifies the default listening address to `localhost`, which is different to `127.0.0.1`, which is what Wrangler 1 does.
For most developers this will make no observable difference, since the default host mapping in most OSes from `localhost` to `127.0.0.1`.

Resolves [#584](https://github.com/cloudflare/wrangler2/issues/584)
