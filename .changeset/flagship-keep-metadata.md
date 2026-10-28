---
"wrangler": patch
---

Keep Flagship flag metadata when updating flags

`wrangler flagship flags` commands that update an existing flag, such as `enable`, `set`, `rollout`, `split`, and `rules`, no longer clear the flag's metadata. `wrangler flagship flags pull` now copies metadata into the local flag store.
