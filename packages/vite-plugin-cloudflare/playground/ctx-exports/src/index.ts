import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

export class MyWorkerEntrypoint extends WorkerEntrypoint {
	greet(name: string) {
		return `Hello ${name} from a Worker Entrypoint`;
	}
}

export class MyDurableObject extends DurableObject {
	greet(name: string) {
		return `Hello ${name} from a Durable Object`;
	}
}

export default {
	async fetch(request, __, ctx) {
		const url = new URL(request.url);

		switch (url.pathname) {
			case "/worker-entrypoint": {
				const result = await ctx.exports.MyWorkerEntrypoint.greet("World");

				return new Response(result);
			}
			case "/durable-object": {
				const id = ctx.exports.MyDurableObject.idFromName("id");
				const stub = ctx.exports.MyDurableObject.get(id);
				const result = await stub.greet("World");

				return new Response(result);
			}
			default: {
				return new Response("Fallback");
			}
		}
	},
} satisfies ExportedHandler;
