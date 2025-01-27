import { WorkerEntrypoint } from "cloudflare:workers";

export class WorkerB extends WorkerEntrypoint {
  // Currently, entrypoints without a named handler are not supported
  async fetch() { return new Response("Hello"); }

  async add(a, b) { return a + b; }
}

export default {
	async fetch(request: Request, env): Promise<Response> {
		// const result = await env.WORKER_A.mul(2, 5);
		const response = await env.WORKER_A_FETCHER.fetch(request);
		const greeting = await response.text();
		return new Response(
			`[worker-b] Says:\n` +
			`- received from service binding WORKER_A: ${greeting}\n`
			// `- received from service bindign WORKER_A: ${result}`
		);
	}
}