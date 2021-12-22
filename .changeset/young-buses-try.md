---
"wrangler": patch
---

Refactor the way we convert configurations for bindings all the way through to the API where we upload a worker definition. This commit preserves the configuration structure (mostly) until the point we serialise it for the API. This prevents the way we use duck typing to detect a binding type when uploading, makes the types a bit simpler, and makes it easier to add other types of bindings in the future (notably, the upcoming service bindings.)
