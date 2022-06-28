---
"wrangler": patch
---

feat: implement `config.define`

This implements `config.define`. This lets the user define a map of keys to strings that will be substituted in the worker's source. This is particularly useful when combined with environments. A common usecase is for values that are sent along with metrics events; environment name, public keys, version numbers, etc. It's also sometimes a workaround for the usability of module env vars, which otherwise have to be threaded through request function stacks.
