---
"@cloudflare/vite-plugin": patch
---

Add new `mixedMode` experimental option

Add a new `mixedMode` experimental option that allows uses to have their worker access remote resources during development (and preview)

To enabled mixed mode set the corresponding option to the cloudflare plugin instantiation:

```js
export default defineConfig({
	plugins: [
		cloudflare({
			// ...
			experimental: { mixedMode: true },
		}),
	],
});
```

Thereafter bindings configured with the `remote` flags will be accessible by workers' code when run via `vite dev` and `vite preview`
