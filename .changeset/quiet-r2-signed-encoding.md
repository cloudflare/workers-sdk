---
"miniflare": patch
---

Fix signature verification for signed `Accept-Encoding` headers on the experimental local R2 S3 endpoint

Restore the original client-supplied header, including its absence, before forwarding requests to the local S3 endpoint. This prevents `SignatureDoesNotMatch` errors for some S3-compatible clients that sign `Accept-Encoding: identity`, while preserving header normalization for normal Worker requests.
