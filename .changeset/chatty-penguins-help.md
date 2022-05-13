---
"wrangler": patch
---

fix: encode key when calling `kv:ket get`, don't encode when deleting a namespace

This cleans up some logic from https://github.com/cloudflare/wrangler2/pull/964.

- we shouldn't be encoding the id when deleting a namespace, since that'll already be an alphanumeric id
- we should be encoding the key when we call kv:key get, or we get a similar issue as in https://github.com/cloudflare/wrangler2/issues/961
- adds `KV` to all the KV-related function names
- moves the api calls to `kv:namespace delete` and `kv:key delete` inside `kv.ts` helpers.
