---
"wrangler": patch
---

Support function-based Vite configs in autoconfig setup

`wrangler setup` and `wrangler deploy --x-autoconfig` can now automatically add the Cloudflare Vite plugin to projects that use function-based `defineConfig()` patterns. Previously, autoconfig would fail with "Cannot modify Vite config: expected an object literal but found ArrowFunctionExpression" for configs like:

```ts
export default defineConfig(({ isSsrBuild }) => ({
	plugins: [reactRouter(), tsconfigPaths()],
}));
```

This pattern is used by several official framework templates, including React Router's `node-postgres` and `node-custom-server` templates. The following `defineConfig()` patterns are now supported:

- `defineConfig({ ... })` (object literal, already worked)
- `defineConfig(() => ({ ... }))` (arrow function with expression body)
- `defineConfig(({ isSsrBuild }) => ({ ... }))` (arrow function with destructured params)
- `defineConfig(() => { return { ... }; })` (arrow function with block body)
- `defineConfig(function() { return { ... }; })` (function expression)
