---
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

Upload `wrangler preview` modules as multipart form data

`wrangler preview` used to base64 the bundle, its modules, and any sourcemaps into a single JSON request body. Base64 inflates content by a third, so a Worker with a large sourcemap could exceed the API request size limit and fail to deploy.

The preview deployment request is now `multipart/form-data`. The deployment settings travel in a `metadata` part and each module follows as its own part carrying raw bytes, matching how `wrangler deploy` already uploads a Worker.
