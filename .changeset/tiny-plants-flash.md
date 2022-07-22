---
"wrangler": patch
---

feat: add `config.inspector_port`

This adds a configuration option for the inspector port used by the debugger in `wrangler dev`. This also includes a bug fix where we weren't passing on this configuration to local mode.
