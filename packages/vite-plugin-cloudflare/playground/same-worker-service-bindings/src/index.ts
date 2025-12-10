import { WorkerEntrypoint } from "cloudflare:workers";

interface Env {
	NAMED_ENTRYPOINT: Fetcher<NamedEntrypoint>;
}

export class NamedEntrypoint extends WorkerEntrypoint {
	multiply(a: number, b: number) {
		return a * b;
	}
}

export default {
	async fetch(_, env) {
		const result = await env.NAMED_ENTRYPOINT.multiply(4, 5);
		return Response.json({ result });
	},
} satisfies ExportedHandler<Env>;
