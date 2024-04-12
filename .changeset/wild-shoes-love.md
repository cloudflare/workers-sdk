---
"miniflare": patch
---

fix: add partial support for RPC in magic proxy

currently `Miniflare#getBindings()` does not return valid proxies to provided `serviceBindings` using RPC, make sure that appropriate proxies are instead returned

(Note: such RPC support is partial and does not include RPC stubs, support for those will be added soon)

Example:

```ts
import { Miniflare } from "miniflare";

const mf = new Miniflare({
	workers: [
		{
			modules: true,
			script: `export default { fetch() { return new Response(''); } }`,
			serviceBindings: {
				SUM: {
					name: "sum-worker",
					entrypoint: "SumEntrypoint",
				},
			},
		},
		{
			modules: true,
			name: "sum-worker",
			script: `
        import { WorkerEntrypoint } from 'cloudflare:workers';

        export default { fetch() { return new Response(''); } }

        export class SumEntrypoint extends WorkerEntrypoint {
            sum(args) {
                return args.reduce((a, b) => a + b);
            }
        }
      `,
		},
	],
});

const { SUM } = await mf.getBindings();

const numbers = [1, 2, 3];

console.log(`The sum of ${numbers.join(", ")} is ${await SUM.sum(numbers)}`); // <--- prints 'The sum of 1, 2, 3 is 6'

await mf.dispose();
```
