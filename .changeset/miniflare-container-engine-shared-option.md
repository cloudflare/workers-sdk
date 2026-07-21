---
"miniflare": major
---

Move `containerEngine` from a per-worker option to a top-level option

`containerEngine` is now a top-level Miniflare option rather than a per-worker option, reflecting that it configures a single container engine for the whole Miniflare instance.

```js
new Miniflare({
	containerEngine: "unix:///var/run/docker.sock",
	workers: [{ name: "my-worker", script: "..." }],
});
```

Previously it was set inside each worker's options.
