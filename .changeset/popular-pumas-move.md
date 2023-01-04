---
"wrangler": patch
---

fix: Pages Plugin routing when mounted at the root of a project

Previously, there was a bug which meant that Plugins mounted at the root of a Pages project were not correctly matching incoming requests. This change fixes that bug so Plugins mounted at the root should now correctly work.
