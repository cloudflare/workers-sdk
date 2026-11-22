---
"miniflare": patch
---

Honor `start_after` when listing R2 objects through the Local Explorer API

Listing a local bucket with `GET /r2/buckets/{bucket_name}/objects?start_after=<key>` previously ignored `start_after` and returned every key, including the boundary key itself. The listing now returns only objects whose keys sort after `start_after`, matching the Cloudflare API, and works together with `prefix`, `per_page` and `cursor`.
