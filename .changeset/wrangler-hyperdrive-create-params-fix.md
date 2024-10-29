---
"wrangler": patch
---

fix: make individual parameters work for `wrangler hyperdrive create` when not using HoA

`wrangler hyperdrive create` individual parameters were not setting the database name correctly when calling the api.
