---
"wrangler": patch
---

fix: `--alias` CLI flag now works in `wrangler deploy`

The `--alias` flag was accepted but silently ignored during `wrangler deploy` — only `config.alias` took effect. We now collect aliases from both config and CLI flags.
