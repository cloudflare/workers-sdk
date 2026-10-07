---
"miniflare": patch
---

Support single-object R2 deletion through the Local Explorer API

Local R2 clients can now delete an object with `DELETE /r2/buckets/{bucket_name}/objects/{object_key}` instead of having to use the bulk-delete endpoint. The route handles path-like keys and uses the same storage service as other local R2 operations.
