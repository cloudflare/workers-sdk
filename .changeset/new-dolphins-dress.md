---
"wrangler": minor
---

fix: Fix Pages config validation around Durable Objects

Today Pages cannot deploy Durable Objects itself. For this reason it is mandatory that when declaring Durable Objects bindings in the config file, the `script_name` is specified. We are currently not failing validation if
`script_name` is not specified but we should. These changes fix that.
