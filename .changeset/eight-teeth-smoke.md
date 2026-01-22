---
"wrangler": patch
---

Fix `wrangler secret list` to error when the Worker is not found

Previously, running `wrangler secret list` against a non-existent Worker would silently return an empty array, making it difficult to diagnose issues like being logged into the wrong account. It now returns an error with suggestions for common causes.
