---
"wrangler": patch
---

fix: prevent repeated reloads with circular service bindings

`wrangler@3.19.0` introduced a bug where starting multiple `wrangler dev` sessions with service bindings to each other resulted in a reload loop. This change ensures Wrangler only reloads when dependent `wrangler dev` sessions start/stop.
