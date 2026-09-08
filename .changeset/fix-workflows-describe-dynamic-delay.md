---
"wrangler": patch
---

Fix `wrangler workflows instances describe` crashing on dynamic retry delays

Fixed an issue where `wrangler workflows instances describe` crashed with `RangeError: Invalid time value` when describing a workflow instance with a dynamic retry delay (`[dynamic]`) waiting between retry attempts. The `Retries At` column now displays `unknown (dynamic delay)` instead of throwing an unhandled exception.
