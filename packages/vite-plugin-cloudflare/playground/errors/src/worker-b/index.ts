import { WorkerEntrypoint } from "cloudflare:workers";

interface Env {
	NAMED_ENTRYPOINT: Service<NamedEntrypoint>;
}

export class NamedEntrypoint extends WorkerEntrypoint {
	override fetch() {
		// @ts-expect-error: deliberate error
		console.log(d);

		return new Response("Auxiliary Worker named entrypoint");
	}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		switch (url.pathname) {
			case "/auxiliary-worker/default-export": {
				// @ts-expect-error: deliberate error
				console.log(c);

				return new Response("Auxiliary Worker default export");
			}
			case "/auxiliary-worker/named-entrypoint": {
				return env.NAMED_ENTRYPOINT.fetch(request);
			}
			default: {
				return new Response("Auxiliary Worker fallback");
			}
		}
	},
} satisfies ExportedHandler<Env>;
