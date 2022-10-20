---
"pages-functions-with-routes-app": patch
"pages-workerjs-with-routes-app": patch
"wrangler": patch
---

fix(pages): `/` exclude rule in `_routes.json` overrides any include routes when running `wrangler pages dev`

Because of the way we perform custom route rule matching, and because we always
apply `exclude` rules first, `wrangler pages dev` will ignore any `include` rules, if `exclude` contains a rule that references a root level index (`/`).

This commit makes sure that root level `exclude` rules are properly handled and will
not override any `include` rules we have in place.
