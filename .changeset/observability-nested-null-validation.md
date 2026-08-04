---
"@cloudflare/workers-utils": patch
---

Report a null `observability.logs`/`observability.traces` as a config error instead of crashing

`{ "observability": { "enabled": true, "logs": null } }` crashed with `TypeError: Cannot read properties of null (reading 'enabled')` instead of producing a validation error. Because `typeof null === "object"`, null passed the type check for these nested objects and then the per-property checks dereferenced it.

Null is now rejected with a normal config error, matching how a null top-level `observability` is already handled.
