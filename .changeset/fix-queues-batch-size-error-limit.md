---
"miniflare": patch
---

Fix incorrect byte limit reported in the local Queues batch-size error

When a queue batch exceeded the maximum batch byte size in local dev, the thrown `PayloadTooLargeError` hardcoded the limit as `256000`, even though the value actually enforced is `288000` bytes (`(256 + 32) * 1000`). The message now interpolates the real limit, consistent with the other Queue limit errors in the same file.
