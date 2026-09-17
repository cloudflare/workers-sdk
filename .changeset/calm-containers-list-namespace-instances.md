---
"@cloudflare/containers-shared": minor
"wrangler": minor
---

Support namespace-backed Container applications in Wrangler's management commands.

`wrangler containers instances` now accepts 32-character lowercase Durable Object namespace application IDs and uses the canonical instance API for those IDs only. All UUID application IDs, including `a03` UUIDs, continue to use the Dashboard instance API. Namespace instance output preserves complete details in JSON. The new `--state` and `--name-prefix` filters are experimental and require `--experimental-instance-filters` (alias `--x-instance-filters`), which is off by default. Listing follows every page by default. Application management distinguishes namespace IDs from instance actor IDs, while `wrangler containers list` reports live instances separately from the configured scheduler replica count and returns every application page.
