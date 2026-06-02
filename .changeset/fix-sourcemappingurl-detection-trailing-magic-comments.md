---
"wrangler": patch
---

Fix `wrangler deploy --upload-source-maps` silently skipping source maps when the entry file ends with magic comments after `//# sourceMappingURL=`

Wrangler previously assumed the `//# sourceMappingURL=` comment was the last non-empty line of a module. Tools like `sentry-cli sourcemaps inject` append a `//# debugId=` comment after it, which silently caused source maps to be omitted from the upload form, most commonly when deploying with `--no-bundle --upload-source-maps`. Wrangler now scans trailing magic comments (lines starting with `//#` or `//@`) and detects the `//# sourceMappingURL=` comment regardless of which other magic comments follow it.
