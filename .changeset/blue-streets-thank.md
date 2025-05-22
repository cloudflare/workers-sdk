---
"miniflare": minor
---

Add a new `defaultPersistRoot` option to control where plugins persist data when no path is provided.

```js
// Before this change / No `defaultPersistRoot`
new Miniflare({
	kvPersist: undefined, // → "/(tmp)/kv"
	d1Persist: true, // → "/.mf/d1"
	r2Persist: false, // → "/(tmp)/d1"
	cachePersist: "/my-cache", // → "/my-cache"
});

// With `defaultPersistRoot`
new Miniflare({
	defaultPersistRoot: "/storage",
	kvPersist: undefined, // → "/storage/kv"
	d1Persist: true, // → "/storage/d1"
	r2Persist: false, // → "/(tmp)/d1"
	cachePersist: "/my-cache", // → "/my-cache"
});
```
