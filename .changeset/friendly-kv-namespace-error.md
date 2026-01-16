---
"wrangler": patch
---

Improve error message when creating duplicate KV namespace

When attempting to create a KV namespace with a title that already exists, Wrangler now provides a clear, user-friendly error message instead of the generic API error. The new message explains that the namespace already exists and suggests running `wrangler kv namespace list` to see existing namespaces with their IDs, or choosing a different namespace name.
