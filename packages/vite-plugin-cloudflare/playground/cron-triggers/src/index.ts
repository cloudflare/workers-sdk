import { WorkerEntrypoint } from "cloudflare:workers";

export default class extends WorkerEntrypoint {
	async fetch(): Promise<Response> {
		return new Response("Hello cron trigger Worker playground!");
	}

	async scheduled() {
		console.log("Cron processed");
	}
}
