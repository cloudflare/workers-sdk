---
"wrangler": major
---

feat: remove the default 'worker' prefix from the `kv:namespace create` command

Previously, if there was no Worker defined by a local `wrangler.toml` or that Worker had no `name` property
then any KV namespace that was created by Wrangler would use `worker_` as a prefix, rather than the Worker's
name.

This is a minor breaking change to the name given to a newly created KV namespace, which is unlikely to affect
many, if any, developers.
