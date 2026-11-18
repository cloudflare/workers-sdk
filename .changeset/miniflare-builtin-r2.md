---
"miniflare": minor
"wrangler": minor
---

Use workerd's built-in R2 for local R2 buckets

Local R2 buckets are now run by workerd's own R2 Worker rather than simulated by Miniflare. Their objects live in a new `r2-workerd` directory under the persistence path (`.wrangler/state/v3/r2-workerd` by default), one file per object. Objects report `storageClass` `"Standard"`, as R2 does, rather than `""`.

A multipart part's etag is now the MD5 of its bytes, so uploading the same bytes twice gives the same etag, and aborting an unknown multipart upload succeeds instead of failing. Completing an upload with no parts gives a plain MD5 etag. Keys with a `.` or `..` path segment are refused as invalid object names.

#### Breaking changes

Local R2 data from earlier versions is not carried over: buckets start empty, and the old `.wrangler/state/v3/r2` directory is left as it was. Remote buckets are unchanged.
