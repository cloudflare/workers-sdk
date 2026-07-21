---
"miniflare": major
---

Consolidate persistence and temporary directory options

The per-resource persistence options (`kvPersist`, `r2Persist`, `d1Persist`, `cachePersist`, `durableObjectsPersist`, `workflowsPersist`, `secretsStorePersist`, `analyticsEngineDatasetsPersist`, `streamPersist`, `imagesPersist`, and `helloWorldPersist`) have been removed. The `Miniflare.unsafeGetPersistPaths()` method, which provided the per-resource persistence paths, has also been removed as they can now be stably inferred from the base path.

For consistency and clarity, `defaultPersistRoot` and `defaultProjectTmpPath` have been renamed to `resourcePersistencePath` and `resourceTmpPath`, respectively.

For example:

```js
new Miniflare({
	resourcePersistencePath: ".wrangler/state/v3",
	resourceTmpPath: ".wrangler/tmp",
});
```

When `resourcePersistencePath` is set, each resource persists to a subdirectory named after its plugin (e.g. `.wrangler/state/v3/kv`). When it is omitted, resources are ephemeral and their data is cleared on dispose.
