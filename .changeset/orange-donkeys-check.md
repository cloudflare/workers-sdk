---
"@cloudflare/vite-plugin": minor
---

We now automatically inject the following HMR code into your Worker entry file:

```ts
if (import.meta.hot) {
	import.meta.hot.accept();
}
```

This prevents file changes from invalidating the full module graph and improves HMR performance in development.
