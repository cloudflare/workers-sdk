---
"@cloudflare/cli": minor
---

Add gitignore helpers for appending Wrangler-related entries

New `maybeAppendWranglerToGitIgnore` and `maybeAppendWranglerToGitIgnoreLikeFile` functions that automatically append Wrangler-related entries (`.wrangler`, `.dev.vars*`, `.env*`, and their negated example patterns) to `.gitignore` or similar ignore files. Existing entries are detected and skipped to avoid duplicates.
