---
"wrangler": patch
---

fix: Validate `routes` in `wrangler dev` and `wrangler deploy` for Workers with assets

We want wrangler to error if users are trying to deploy a Worker with assets, and routes with a path component.

All Workers with assets must have either:

- custom domain routes
- pattern routes which have no path component (except for the wildcard splat) "some.domain.com/\*"
