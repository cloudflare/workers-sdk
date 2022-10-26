---
"wrangler": patch
---

The type command aggregates bindings and [custom module rules](https://developers.cloudflare.com/workers/wrangler/configuration/#bundling) from config, then generates a DTS file for both service workers' `declare global { ... }` or module workers' `interface Env { ... }`

Custom module rules generate `declare module`s based on the module type (`Text`, `Data` or `CompiledWasm`).
Module Example Outputs:

**CompiledWasm**

```ts
declare module "**/*.wasm" {
	const value: WebAssembly.Module;
	export default value;
}
```

**Data**

```ts
declare module "**/*.webp" {
	const value: ArrayBuffer;
	export default value;
}
```

**Text**

```ts
declare module "**/*.text" {
	const value: string;
	export default value;
}
```

resolves #2034
resolves #2033
