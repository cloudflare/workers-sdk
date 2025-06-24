---
"wrangler": patch
---

Update containers config schema.

Deprecates `containers.configuration` in favour of top level fields. Makes top level `image` required. Deprecates `instances` and `durable_objects`. Makes `name` optional.
