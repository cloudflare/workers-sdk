---
"wrangler": minor
---

Temporary file directory is now configurable via the `WRANGLER_TMP_DIR` environment variable. When set, Wrangler will use the specified directory for temporary files instead of the default `.wrangler/tmp` folder in the project root. This allows users to customize where temporary files are stored, which can be useful for CI environments or when working with specific filesystem constraints.
