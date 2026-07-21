---
"miniflare": major
---

Consolidate persistence and temporary directory options

The per-resource persistence options (`kvPersist`, `r2Persist`, `d1Persist`, `cachePersist`, `durableObjectsPersist`, `workflowsPersist`, `secretsStorePersist`, `analyticsEngineDatasetsPersist`, `streamPersist`, `imagesPersist`, and `helloWorldPersist`) have been removed, along with `defaultPersistRoot` and `defaultProjectTmpPath`. Persistence is now configured with two options:

```js
new Miniflare({
	resourcePersistencePath: ".wrangler/state/v3",
	resourceTmpPath: ".wrangler/tmp",
});
```

When `resourcePersistencePath` is set, each resource persists to a subdirectory named after its plugin (e.g. `.wrangler/state/v3/kv`). When it is omitted, resources are ephemeral and their data is cleared on dispose. The `boolean`, `memory:`, `file:` and relative-path forms of the old per-resource options, the `.mf` default directory, and the `Miniflare.unsafeGetPersistPaths()` method have also been removed.
