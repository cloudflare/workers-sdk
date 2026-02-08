---
"miniflare": minor
---

Add `Miniflare#purgeCache()` method to clear cache entries programmatically

This allows developers to clear cached data during local development without
restarting the Miniflare instance. Useful when working with Workers Sites
or any application that uses the Cache API.

```typescript
const mf = new Miniflare({
	/* options */
});

// Purge the default cache
await mf.purgeCache();

// Purge a specific named cache
await mf.purgeCache("my-named-cache");
```
