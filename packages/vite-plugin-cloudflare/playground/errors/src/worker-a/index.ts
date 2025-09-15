import { WorkerEntrypoint } from "cloudflare:workers";

interface Env {
	NAMED_ENTRYPOINT: Service<NamedEntrypoint>;
	AUXILIARY_WORKER: Service;
}

export class NamedEntrypoint extends WorkerEntrypoint {
	override fetch() {
		// @ts-expect-error: deliberate error
		console.log(b);

		return new Response("Named entrypoint");
	}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		switch (url.pathname) {
			case "/default-export": {
				// @ts-expect-error: deliberate error
				console.log(a);

				return new Response("Default export");
			}
			case "/named-entrypoint": {
				// Note: if the response is returned directly then the stack trace is incorrect
				const response = await env.NAMED_ENTRYPOINT.fetch(request);

				return response;
			}
			case "/auxiliary-worker/default-export": {
				// Note: if the response is returned directly then the stack trace is incorrect
				const response = await env.AUXILIARY_WORKER.fetch(request);

				return response;
			}
			case "/auxiliary-worker/named-entrypoint": {
				// Note: if the response is returned directly then the stack trace is incorrect
				const response = await env.AUXILIARY_WORKER.fetch(request);

				return response;
			}
			default: {
				return new Response("Fallback");
			}
		}
	},
} satisfies ExportedHandler<Env>;
