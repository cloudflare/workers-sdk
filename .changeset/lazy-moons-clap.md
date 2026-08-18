---
"miniflare": minor
---

Show Flagship feature flags in the local explorer

Flagship apps bound to your Worker now appear in the local explorer sidebar. Selecting one lists the flags in its local store, showing each flag's type, default variation and whether it is enabled. Flags can be created, switched on and off, and evaluated to see which value a Worker would receive.

Targeting rules are not editable here — use `wrangler flagship flags rules` for those. To start from the flags your remote app already has, run `wrangler flagship flags pull`.
