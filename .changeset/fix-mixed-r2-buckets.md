---
"miniflare": patch
---

fix: allow mixed `r2Buckets` records containing both string and object entries

Previously, passing an `r2Buckets` config that mixed plain string values and object entries (e.g. `{ MY_BUCKET: "bucket-name", OTHER_BUCKET: { ... } }`) would cause Miniflare to throw an error. Both forms are now accepted and normalised correctly.
