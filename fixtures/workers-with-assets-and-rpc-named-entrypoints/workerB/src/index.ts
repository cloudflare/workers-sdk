import { WorkerEntrypoint } from "cloudflare:workers";

export class WorkerB extends WorkerEntrypoint {
	async fetch() {
		return new Response("Hello from WORKER_🐝 fetch");
	}

	async beeHi() {
		return "Greetings busy 🐝🐝🐝";
	}
}

export default class extends WorkerEntrypoint {
	async fetch(request, env) {
		return new Response("Hello from WORKER_🐝 default entrypoint's fetch");
	}
}
