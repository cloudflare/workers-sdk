---
"miniflare": minor
---

feature: support named entrypoints for `serviceBindings`

This change allows service bindings to bind to a named export of another Worker using designators of the form `{ name: string | typeof kCurrentWorker, entrypoint?: string }`. Previously, you could only bind to the `default` entrypoint. With this change, you can bind to any exported entrypoint.

```ts
import { kCurrentWorker, Miniflare } from "miniflare";

const mf = new Miniflare({
	workers: [
		{
			name: "a",
			serviceBindings: {
				A_RPC_SERVICE: { name: kCurrentWorker, entrypoint: "RpcEntrypoint" },
				A_NAMED_SERVICE: { name: "a", entrypoint: "namedEntrypoint" },
				B_NAMED_SERVICE: { name: "b", entrypoint: "anotherNamedEntrypoint" },
			},
			compatibilityFlags: ["rpc"],
			modules: true,
			script: `
			import { WorkerEntrypoint } from "cloudflare:workers";
			
			export class RpcEntrypoint extends WorkerEntrypoint {
				ping() { return "a:rpc:pong"; }
			}
			
			export const namedEntrypoint = {
				fetch(request, env, ctx) { return new Response("a:named:pong"); }
			};
			
			...
			`,
		},
		{
			name: "b",
			modules: true,
			script: `
			export const anotherNamedEntrypoint = {
				fetch(request, env, ctx) { return new Response("b:named:pong"); }
			};
			`,
		},
	],
});
```
