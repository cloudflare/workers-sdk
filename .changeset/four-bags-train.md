---
"wrangler": patch
---

patch: Consolidate redundant routes when generating \_routes.generated.json

Example: `["/foo/:name", "/foo/bar"] => ["/foo/*"]`
