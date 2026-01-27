---
"wrangler": patch
---

Handle registry ports when matching container image digests

Wrangler now strips tags without breaking registry ports when comparing local
images to remote digests. This prevents unnecessary pushes for tags like
`localhost:5000/app:tag`.
