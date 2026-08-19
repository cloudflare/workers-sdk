---
"miniflare": minor
---

Add experimental shared local storage, letting several Miniflare instances read and write one set of local resources

Each instance previously kept its own copy of local state, so two dev sessions pointed at the same KV namespace or D1 database could not see each other's writes. Instances that opt in now elect a single storage owner through the dev registry and route storage through it, so resources with the same ID resolve to the same data.

Opt in with `unsafeEnableSharedStorage`, which requires three paths to be set:

```js
new Miniflare({
	unsafeEnableSharedStorage: true,
	// Shared between instances: resources that participate in sharing live here
	resourcePersistencePath: "/path/to/shared/state",
	// Per project: resources that cannot be shared keep their own state here
	isolatedResourcePersistencePath: "/path/to/project/state",
	// Instances elect the storage owner through the dev registry
	unsafeDevRegistryPath: "/path/to/registry",
	// ...
});
```

KV, D1, R2, Rate Limits, and Secrets Store participate in sharing. Cache, Durable Objects, Workflows, observability, and Hello World storage do not yet, and stay instance-local under `isolatedResourcePersistencePath`, keeping their state across restarts without concurrent access to the shared root.

This is experimental and the `unsafe`-prefixed options may change without a major version bump.
