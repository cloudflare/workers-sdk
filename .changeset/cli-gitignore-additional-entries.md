---
"@cloudflare/cli-shared-helpers": minor
---

Allow additional entries in `maybeAppendWranglerToGitIgnoreLikeFile` and export `PROJECT_ROOT_ASSETS_IGNORE_ENTRIES`

`maybeAppendWranglerToGitIgnoreLikeFile` accepts an optional list of further entries to append after the Wrangler entries, each added only if the file does not already contain that exact line. `PROJECT_ROOT_ASSETS_IGNORE_ENTRIES` lists the entries to add to an `.assetsignore` in a project root used as the static assets directory.
