---
"wrangler": patch
---

Clarify the problem when trying to delete a KV namespace that has an invalid name.

Previously, there would be a bizarre authentication error when attempting to delete a KV namespace with a name like `my-namespaceඞ`. Now, wrangler will validate that an ID is valid before attempting to delete it.
