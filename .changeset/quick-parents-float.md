---
"miniflare": patch
---

fix: add support for wrapped bindings in magic proxy

currently `Miniflare#getBindings()` does not return proxies to provided `wrappedBindings`, make sure that appropriate proxies are instead returned

Example:

```ts
import { Miniflare } from "miniflare";

const mf = new Miniflare({
	workers: [
		{
			wrappedBindings: {
				Greeter: {
					scriptName: "impl",
				},
			},
			modules: true,
			script: `export default { fetch(){ return new Response(''); } }`,
		},
		{
			modules: true,
			name: "impl",
			script: `
				class Greeter {
					sayHello(name) {
						return "Hello " + name;
					}
				}

				export default function (env) {
					return new Greeter();
				}
			`,
		},
	],
});

const { Greeter } = await mf.getBindings();

console.log(Greeter.sayHello("world")); // <--- prints 'Hello world'

await mf.dispose();
```
