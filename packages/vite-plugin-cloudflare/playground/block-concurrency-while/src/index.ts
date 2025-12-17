import { DurableObject } from "cloudflare:workers";

interface Env {
	MyDurableObject: DurableObjectNamespace<MyDurableObject>;
}

export class MyDurableObject extends DurableObject {
	#isInitialized = false;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		console.log("constructor");
		void this.ctx.blockConcurrencyWhile(async () => {
			console.log("blockConcurrencyWhile");
			this.#isInitialized = true;
		});
	}

	get isInitialized() {
		console.log("isInitialized");
		return this.#isInitialized;
	}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === "/durable-object") {
			const id = env.MyDurableObject.idFromName("test-id");
			const stub = env.MyDurableObject.get(id);

			return Response.json({ isInitialized: await stub.isInitialized });
		}

		return new Response(null, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
