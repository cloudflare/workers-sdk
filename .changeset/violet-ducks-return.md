---
"wrangler": patch
---

Display a clearer error message when when trying to delete a KV namespace with an invalid namespace-id.

Previously, there would be a bizarre authentication error when attempting to delete a KV namespace with an invalid namespace-id like `my-namespaceඞ`. Now, wrangler will validate that an ID is valid before attempting to delete it.
