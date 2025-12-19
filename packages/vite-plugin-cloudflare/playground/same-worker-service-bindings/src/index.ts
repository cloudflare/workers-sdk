import { WorkerEntrypoint } from "cloudflare:workers";

interface Env {
	NAMED_ENTRYPOINT: Fetcher<NamedEntrypoint>;
	LEGACY: Fetcher;
}

export class NamedEntrypoint extends WorkerEntrypoint {
	multiply(a: number, b: number) {
		return a * b;
	}
}

// Included to ensure that plain objects are also supported as Worker entrypoints
export const legacy = {
	fetch() {
		return new Response("Legacy Worker entrypoint");
	},
};

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === "/legacy") {
			return env.LEGACY.fetch(request);
		}

		const result = await env.NAMED_ENTRYPOINT.multiply(4, 5);
		return Response.json({ result });
	},
} satisfies ExportedHandler<Env>;
