---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Improve asset upload performance with single-file uploads

Asset uploads now use a more efficient per-file upload path when the platform enables it. This is rolled out server-side and requires no configuration changes. Existing upload behavior is unchanged when the new path is not enabled.
