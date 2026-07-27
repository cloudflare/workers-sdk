---
"miniflare": minor
---

Add a local S3-compatible API for R2 buckets at `/cdn-cgi/local/r2/s3/<bucket-id>`, where `<bucket-id>` is the ID the bucket is configured with in the `r2Buckets` option

Buckets configured with `s3Credentials: { accessKeyId, secretAccessKey }` in `r2Buckets` are served over an S3-compatible HTTP API, authenticated with AWS Signature Version 4 (both `Authorization` header and presigned URL query authentication). Supported operations: GetObject, HeadObject, PutObject, CopyObject, DeleteObject, DeleteObjects, ListObjects, ListObjectsV2, HeadBucket, ListBuckets, CreateMultipartUpload, UploadPart, UploadPartCopy, CompleteMultipartUpload, and AbortMultipartUpload. Status codes, error responses, and unsupported-header screening mirror R2's S3 endpoint, including its static responses for bucket-configuration reads and its named errors for unimplemented operations.
