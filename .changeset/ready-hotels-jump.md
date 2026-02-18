---
"miniflare": minor
---

Local explorer: add /query endpoint to introspect sqlite in DOs

This required adding a wrapper that extends user DO classes and adds in an extra method to access `ctx.storage.sql`. This _shouldn't_ have any impact on user code, but is gated by the env var `X_LOCAL_EXPLORER`.

This is for an experimental WIP feature.
