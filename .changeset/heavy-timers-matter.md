---
"wrangler": patch
---

fix: Consolidate routes that are over the limit to prevent failed deployments

Rather than failing a deployment because a route is too long (>100 characters), it will now be shortened to the next available level. Eg. `/foo/aaaaaaa...` -> `/foo/*`
