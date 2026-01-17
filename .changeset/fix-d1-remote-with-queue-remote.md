---
"miniflare": patch
---

fix: properly handle remote queue producer bindings in local development

Queue producer bindings configured with `remote: true` now correctly use the remote proxy connection, fixing an issue where having both D1 and queue remote bindings would cause D1 remote bindings to fail.
