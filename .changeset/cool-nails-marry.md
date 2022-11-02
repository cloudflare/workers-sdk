---
"wrangler": patch
---

fix: Don't upload `functions/` directory as part of `wrangler pages publish`

If the root directory of a project was the same as the build output directory, we were previously uploading the `functions/` directory as static assets. This PR now ensures that the `functions/` files are only used to create Pages Functions and are no longer uploaded as static assets.

Additionally, we also now _do_ upload `_worker.js`, `_headers`, `_redirects` and `_routes.json` if they aren't immediate children of the build output directory. Previously, we'd ignore all files with this name regardless of location. For example, if you have a `public/blog/how-to-use-pages/_headers` file (where `public` is your build output directory), we will now upload the `_headers` file as a static asset.
