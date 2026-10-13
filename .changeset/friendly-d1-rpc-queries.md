---
"miniflare": minor
"wrangler": patch
---

Support local D1 queries through the experimental `d1_binding_jsrpc` compatibility flag

Local D1 bindings now implement the RPC query backend used by `D1Database.query()` and prepared-statement methods when the flag is enabled. Queries reuse local SQLite execution, including transactional batches, execution metadata, and session bookmarks, while bindings without the flag continue to use HTTP. Update the bundled workerd runtime to `1.20261012.1` and align the default compatibility date with that release.
