---
"wrangler": minor
---

Custom build commands now receive environment variables indicating whether they're running for development or deployment. The `WRANGLER_BUILD_TARGET` variable is set to either "dev" or "deploy", and boolean flags `WRANGLER_IS_DEV` and `WRANGLER_IS_DEPLOY` are also provided for easier conditional logic in build scripts.
