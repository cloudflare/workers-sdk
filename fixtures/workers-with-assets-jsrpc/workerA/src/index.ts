import { WorkerEntrypoint } from "cloudflare:workers";

export class WorkerA extends WorkerEntrypoint {
	// Currently, entrypoints without a named handler are not supported
	async fetch() {
		return new Response("Hello from A");
	}

	async mul(a, b) {
		return a * b;
	}
}

export default {
	async fetch(request, env) {
		const fetchResult = await env.WORKER_B_DEFAULT.fetch(request);
		const addResult = await env.WORKER_B_DEFAULT.add(1, 2);
		return new Response(
			`[worker-a] Hello from default fetcher ${await fetchResult.text()} / ${addResult}`
		);
	},
};
