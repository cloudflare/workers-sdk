import { WorkerEntrypoint } from "cloudflare:workers";

export default class extends WorkerEntrypoint {
	async fetch(request) {
		return new Response("Hello from WORKER_🐝 default entrypoint's fetch");
	}

	add(a: number, b: number) {
		return a + b;
	}
}
