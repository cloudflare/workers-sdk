---
"wrangler": patch
---

Fix duration calculation for running workflow instances, steps, and attempts in `wrangler workflows instances describe`

`wrangler workflows instances describe` previously distorted the elapsed duration of in-progress instances, steps, and attempts across non-UTC timezones by stripping `" GMT"` from `toUTCString()`, causing `new Date(...)` to parse the timestamp in the local client timezone. The duration is now correctly computed against the current time.
