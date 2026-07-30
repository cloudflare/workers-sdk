---
"miniflare": patch
---

fix: enforce D1 platform limits in local development

Miniflare now enforces D1 platform limits during local development to match production behavior:

- **Query batch size limit**: Maximum 1000 queries per batch (configurable via `d1QueryLimit` option, default: 1000 for paid tier, can be set to 50 for free tier testing)
- **SQL statement size limit**: Maximum 100KB (100,000 bytes) per SQL statement
- **Bound parameters limit**: Maximum 100 bound parameters per query

These limits prevent issues where code works locally but fails in production due to exceeding D1 platform constraints. When limits are exceeded, appropriate error messages are thrown indicating the specific limit violation.

Configuration example:
```js
const mf = new Miniflare({
  d1Databases: { DB: "database-id" },
  d1QueryLimit: 50, // Optional: test with free tier limits
});
```

Fixes #4582
