---
"wrangler": patch
---

Allow `wrangler delete` to succeed without Workers KV permissions

Deleting a Worker no longer reports a failure when the API token cannot perform optional cleanup of legacy Workers Sites KV namespaces. Wrangler instead warns that the legacy asset namespaces were not removed.
