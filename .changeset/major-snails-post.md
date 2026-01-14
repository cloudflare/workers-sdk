---
"@cloudflare/vite-plugin": minor
---

Add support for child environments.

This is to support React Server Components via [@vitejs/plugin-rsc](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc) and frameworks that build on top of it. A `childEnvironments` option is now added to the plugin config to enable using multiple environments within a single Worker. The parent environment can import modules from a child environment in order to access a separate module graph. For a typical RSC use case, the plugin might be configured as in the following example:

```ts
export default defineConfig({
	plugins: [
		cloudflare({
			viteEnvironment: {
				name: "rsc",
				childEnvironments: ["ssr"],
			},
		}),
	],
});
```
