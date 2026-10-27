---
"@cloudflare/cli-shared-helpers": minor
---

Support writing `.assetsignore` files that keep local secrets and Pages-only files out of uploaded static assets

`maybeAppendWranglerToGitIgnoreLikeFile` now takes an options object. `additionalEntries` appends further entries after the Wrangler ones, skipping any already in the file or already queued. `requireEnvWildcard` makes the helper add `.env*` unless the file already has it, so that a narrower existing entry such as `.env` does not leave `.env.production` or `.env.local` to be uploaded. `PROJECT_ROOT_ASSETS_IGNORE_ENTRIES` lists the entries to add when a project root is used as the static assets directory.
