---
"wrangler": patch
---

chore: rename `getBindingsProxy` to `getPlatformProxy`

initially `getBindingsProxy` was supposed to only provide proxies for bindings,
the utility has however grown, including now `cf`, `ctx` and `caches`, to
clarify the increased scope the utility is getting renamed to `getPlatformProxy`
and its `bindings` field is getting renamed `env`

_note_: `getBindingProxy` with its signature is still kept available, making this
a non breaking change
