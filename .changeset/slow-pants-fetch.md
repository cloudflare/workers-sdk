---
"miniflare": patch
---

fix: ensure unused KV and Cache blobs cleaned up

When storing data in KV, Cache and R2, Miniflare uses both an SQL database and separate blob store. When writing a key/value pair, a blob is created for the new value and the old blob for the previous value (if any) is deleted. A few months ago, we introduced a change that prevented old blobs being deleted for KV and Cache. R2 was unaffected. This shouldn't have caused any problems, but could lead to persistence directories growing unnecessarily as they filled up with garbage blobs. This change ensures garbage blobs are deleted.

Note existing garbage will not be cleaned up. If you'd like to do this, download this Node script (https://gist.github.com/mrbbot/68787e19dcde511bd99aa94997b39076). If you're using the default Wrangler persistence directory, run `node gc.mjs kv .wrangler/state/v3/kv <namespace_id_1> <namespace_id_2> ...` and `node gc.mjs cache .wrangler/state/v3/cache default named:<cache_name_1> named:<cache_name_2> ...` with each of your KV namespace IDs (not binding names) and named caches.
