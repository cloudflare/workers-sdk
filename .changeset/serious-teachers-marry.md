---
"wrangler": major
---

Remove worker name prefix from KV namespace create

BREAKING CHANGE: when running `wrangler kv namespace create <name>`, previously the name of the namespace was automatically prefixed with the worker title, or `worker-` when running outside the context of a worker.
After this change, KV namespaces will no longer get prefixed, and the name used is the name supplied, verbatim.
