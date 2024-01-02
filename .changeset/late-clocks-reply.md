---
"miniflare": minor
---

feat: expose `rows_read` and `rows_written` in D1 result `meta`

`rows_read`/`rows_written` contain the number of rows read from/written to the database engine when executing a query respectively. These numbers may be greater than the number of rows returned from/inserted by a query. These numbers form billing metrics when your Worker is deployed. See https://developers.cloudflare.com/d1/platform/pricing/#billing-metrics for more details.
