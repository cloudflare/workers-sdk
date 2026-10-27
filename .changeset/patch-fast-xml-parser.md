---
"miniflare": patch
"wrangler": patch
---

Update the bundled `fast-xml-parser` to 5.11.2 to address its security advisories

Miniflare's local R2 S3 API and Wrangler's `pipelines` S3 client bundled `fast-xml-parser` 4.4.1, which is affected by DOCTYPE entity-expansion and XMLBuilder comment/CDATA injection advisories (GHSA-m7jm-9gc2-mpf2, GHSA-jmr7-xgp7-cmfj, GHSA-8gc5-j5rx-235r, GHSA-jp2q-39xq-3w4g, GHSA-fj3w-jwp8-x2g3, GHSA-gh4j-gqv2-49f6). Both now bundle the patched 5.x release; the parser API is unchanged.
