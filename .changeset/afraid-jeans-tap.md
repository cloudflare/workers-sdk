---
"wrangler": patch
---

fix: ensure request `url` and `cf` properties preserved across service bindings

Previously, Wrangler could rewrite `url` and `cf` properties when sending requests via service bindings or Durable Object stubs. To match production behaviour, this change ensures these properties are preserved.
