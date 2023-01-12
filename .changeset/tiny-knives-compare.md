---
"wrangler": minor
---

feat: support bundling the raw Pages `_worker.js` before deploying

Previously, if you provided a `_worker.js` file, then Pages would simply check the
file for disallowed imports and then deploy the file as-is.

Not bundling the `_worker.js` file means that it cannot containing imports to other
JS files, but also prevents Wrangler from adding shims such as the one for the D1 alpha
release.

This change adds the ability to tell Wrangler to pass the `_worker.js` through the
normal Wrangler bundling process before deploying by setting the `--bundle`
command line argument to `wrangler pages dev` and `wrangler pages publish`.

This is in keeping with the same flag for `wrangler publish`.

Currently bundling is opt-in, flag defaults to `false` if not provided.
