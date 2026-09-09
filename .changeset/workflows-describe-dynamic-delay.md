---
"wrangler": patch
---

Fix `wrangler workflows instances describe` crashing on dynamic retry delays

The Workflows API serializes function retry delays as `"[dynamic]"`. The describe command previously parsed that as a duration, produced an Invalid Date, and threw `RangeError: Invalid time value` before printing remaining steps. It now renders `unknown (dynamic delay)` and also tolerates attempts whose `end` timestamp is missing.
