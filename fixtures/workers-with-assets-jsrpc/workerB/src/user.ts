import { WorkerEntrypoint } from "cloudflare:workers";

export default class extends WorkerEntrypoint {
	async fetch(request) {
		return new Response(`[user worker fetch]`);
	}
	async add(a, b) {
		return a + b;
	}
}

export class Named extends WorkerEntrypoint {
	async add(a, b) {
		return a + b * 10;
	}
}
