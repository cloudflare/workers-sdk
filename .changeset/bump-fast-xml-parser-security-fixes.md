---
"miniflare": patch
"wrangler": patch
---

Bump bundled `fast-xml-parser` from 4.4.1 to 4.5.5 to pick up security fixes

Miniflare bundles `fast-xml-parser` into its local R2 S3 API, and Wrangler bundles it through the AWS SDK used by `wrangler pipelines`. Version 4.4.1 is affected by several published advisories, and 4.5.5 includes their fixes. XML handling does not change.
