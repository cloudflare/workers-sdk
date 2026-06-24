---
"wrangler": patch
---

`wrangler versions upload --preview-alias` now validates the alias client-side and returns a clear error with a sanitized suggestion when the value contains invalid characters (e.g. slashes from branch names like `feature/my-feature`) or exceeds 63 characters.
