---
"miniflare": minor
---

feature: add a `getCf` method to Miniflare instances

add a new `getCf` method attached to instances of `Miniflare`, this `getCf` returns
the `cf` object that the Miniflare instance provides to the actual workers and it
depends of the core option of the same name

Basic example:

```ts
import { Miniflare } from "miniflare";

const mf = new Miniflare({ ... });

const cf = await mf.getCf();

console.log(`country = ${cf.country} ; colo = ${cf.colo}`); // logs 'country = GB ; colo = LHR'
```

Example with a custom `cf` option:

```ts
import { Miniflare } from "miniflare";

const mf = new Miniflare({
	script: "",
	modules: true,
	cf: {
		helloW: "Hello World",
	},
});

const cf = await mf.getCf();

console.log(cf.helloW); // logs 'Hello World'

await mf.dispose();
```
