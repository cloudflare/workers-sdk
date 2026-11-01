---
"wrangler": patch
---

fix: parse HTTP-dates and ISO strings for `r2 object put --local --expires`

Support standard HTTP-dates (RFC 7234) and ISO 8601 strings when specifying `--expires` in `wrangler r2 object put --local` and `wrangler r2 bulk put --local`, preventing type errors from unparsed date strings and incorrect 1970 timestamp offsets.
