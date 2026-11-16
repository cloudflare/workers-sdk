---
"miniflare": patch
---

Validate `x-amz-checksum-*` headers on the local R2 S3 endpoint

PutObject and UploadPart now check CRC32, CRC32C, SHA-1, and SHA-256 request digests against the body and return `400 BadDigest` on mismatch (SHA-1 / SHA-256 on UploadPart return `501 NotImplemented`, matching real R2). Previously these signed checksum headers were ignored while `Content-MD5` was verified.
