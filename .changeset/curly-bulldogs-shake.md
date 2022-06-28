---
"wrangler": patch
---

fix: pass `routes` to `dev` session

We can pass routes when creating a `dev` session. The effect of this is when you visit a path that _doesn't_ match the given routes, then it instead does a fetch from the deployed worker on that path (if any). We were previously passing `*/*`, i.e, matching _all_ routes in dev; this fix now passes configured routes instead.
