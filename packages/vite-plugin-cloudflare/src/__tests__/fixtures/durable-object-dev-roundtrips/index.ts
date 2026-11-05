import { DurableObject } from "cloudflare:workers";

interface Env {
	COUNTERS: DurableObjectNamespace<Counter>;
}

export class Counter extends DurableObject {
	async ping(): Promise<"pong"> {
		return "pong";
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname !== "/counter") {
			return new Response("Not Found", { status: 404 });
		}

		// Call into the Durable Object several times, as a page whose requests
		// touch Durable Objects repeatedly would.
		const stub = env.COUNTERS.get(env.COUNTERS.idFromName("counter"));
		let count = 0;
		for (let i = 0; i < 5; i++) {
			if ((await stub.ping()) === "pong") {
				count++;
			}
		}

		return Response.json({ count });
	},
} satisfies ExportedHandler<Env>;
