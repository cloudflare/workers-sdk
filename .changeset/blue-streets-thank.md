---
"miniflare": minor
---

Add a new `defaultPersistRoot` option to control where plugins persist data when no path is provided.

```js
// Before this change / No `defaultPersistRoot`
new Miniflare({
	kvPersist: undefined, // → "/(tmp)/kv"
	d1Persist: true, // → "$PWD/.mf/d1"
	r2Persist: false, // → "/(tmp)/r2"
	cachePersist: "/my-cache", // → "/my-cache"
});

// With `defaultPersistRoot`
new Miniflare({
	defaultPersistRoot: "/storage",
	kvPersist: undefined, // → "/storage/kv"
	d1Persist: true, // → "/storage/d1"
	r2Persist: false, // → "/(tmp)/r2"
	cachePersist: "/my-cache", // → "/my-cache"
});
```
