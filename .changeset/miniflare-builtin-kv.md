---
"miniflare": minor
"wrangler": minor
---

Use workerd's built-in KV for local KV namespaces

Local KV namespaces are now kept by workerd itself rather than simulated by Miniflare. Their state lives in a new `builtin` directory under the persistence path (`.wrangler/state/v3/builtin` by default), which workerd's other built-ins will share.

#### Breaking changes

Local KV data from earlier versions is not carried over: namespaces start empty, and the old `.wrangler/state/v3/kv` directory is left as it was. Remote namespaces and Workers Sites are unchanged.
