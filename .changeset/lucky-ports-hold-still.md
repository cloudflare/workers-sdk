---
"miniflare": patch
---

Keep the dev registry debug port stable across runtime reloads

When multiple local dev sessions share a dev registry, each one advertises a debug port that its peers connect to over Cap'n Proto and cache connections against. That port was re-allocated on every runtime reload, so any reload left every peer holding a connection to a port nothing was listening on until the registry update reached them.

The debug port now re-binds the same port across reloads, matching how the inspector port is already handled.

Also fixes tail event forwarding between dev sessions silently swallowing failures: the forwarding RPC's rejection escaped the surrounding `try`/`catch` as an unhandled rejection, so a peer going away produced no diagnostic at all.
