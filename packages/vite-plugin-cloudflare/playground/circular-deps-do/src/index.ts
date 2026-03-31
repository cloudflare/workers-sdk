import { DurableObject } from "cloudflare:workers";
// This import triggers a circular dep inside circular-pkg (a.js ↔ b.js).
// In native ESM this works fine. Under Vite's SSR transform (noExternal: true),
// the live bindings are converted to const, causing TDZ on circular references.
import { sql, greetFromA } from "circular-pkg";

interface Env {
	MY_DO: DurableObjectNamespace<MyDurableObject>;
}

export class MyDurableObject extends DurableObject {
	async fetch(request: Request) {
		return new Response(greetFromA("DO"));
	}
}

export default {
	async fetch(request: Request, env: Env) {
		const url = new URL(request.url);

		if (url.pathname === "/do") {
			const id = env.MY_DO.idFromName("test");
			const stub = env.MY_DO.get(id);
			return stub.fetch(request);
		}

		return new Response(`sql type: ${typeof sql}, greeting: ${greetFromA("worker")}`);
	},
} satisfies ExportedHandler<Env>;
