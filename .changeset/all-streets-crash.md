---
"miniflare": minor
---

Implement local KV API for experimental/WIP local resource explorer

The following APIs have been (mostly) implemented:
GET /storage/kv/namespaces - List namespaces
GET /storage/kv/namespaces/:id/keys - List keys
GET /storage/kv/namespaces/:id/values/:key - Get value
PUT /storage/kv/namespaces/:id/values/:key - Write value
DELETE /storage/kv/namespaces/:id/values/:key - Delete key
POST /storage/kv/namespaces/:id/bulk/get - Bulk get values
