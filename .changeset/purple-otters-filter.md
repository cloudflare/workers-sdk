---
"wrangler": minor
"miniflare": minor
---

Add `--date-start` and `--date-end` filters to `wrangler workflows instances list`

You can now narrow an instance listing to a creation-time window:

`wrangler workflows instances list my-workflow --date-start 2026-01-01 --date-end 2026-01-31`

Either flag can be used independently. Both accept an ISO 8601 date or timestamp and are normalised to UTC before being sent, so a date-only value such as `2026-01-01` works as well as a full `2026-01-01T13:00:00Z`. The bounds are inclusive and compose with the existing `--status` filter.
