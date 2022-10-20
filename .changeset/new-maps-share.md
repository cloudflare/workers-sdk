---
"pages-functions-with-routes-app": patch
"pages-workerjs-with-routes-app": patch
"wrangler": patch
---

fix(pages): `wrangler pages dev` matches routing rules in `_routes.json` too loosely

Currently, the logic by which we transform routing rules in `_routes.json` to
regular expressions, so we can perform `pathname` matching & routing when we
run `wrangler pages dev`, is too permissive, and leads to serving incorrect
assets for certain url paths.

For example, a routing rule such as `/foo` will incorrectly match pathname
`/bar/foo`. Similarly, pathname `/foo` will be incorrectly matched by the
`/` routing rule.
This commit fixes our routing rule to pathname matching logic and brings
`wrangler pages dev` on par with routing in deployed Pages projects.
