---
"miniflare": minor
---

feat: add `unsafeHandleDevRegistryUpdate` callback option to Miniflare

Adds a new option to Miniflare that allows users to register a callback function that gets invoked whenever the dev registry is updated with changes to external services that the current worker depends on.

This callback is useful for scenarios where you need to react to changes in bound services, such as updating bindings tables or reloading configurations when dependent workers are added, removed, or modified in the dev registry.

```typescript
const mf = new Miniflare({
	// ... other options
	unsafeHandleDevRegistryUpdate(registry) {
		console.log("Dev registry updated:", registry);
		// Handle registry updates (e.g., reprint bindings, reload config)
	},
});
```
