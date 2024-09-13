---
"@cloudflare/workers-shared": patch
---

chore: Rename asset-worker RPC methods as unstable\_\*

The Asset Worker is currently set up as a `WorkerEntrypoint` class so that it is able to accept RPC calls to any of its public methods. There are currently four such public methods defined on this Worker: `canFetch`, `getByETag`, `getByPathname` and `exists`. While we are stabilising the implementation details of these methods, we would like to prevent developers from having their Workers call these methods directly. To that end, we are adopting the `unstable_<method_name>` naming convention for all of the aforementioned methods, to indicate that they are still in flux and that they are not an established API contract.
