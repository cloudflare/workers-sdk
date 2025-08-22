import { WorkerEntrypoint } from "cloudflare:workers";

export default class extends WorkerEntrypoint {
	override async fetch(): Promise<Response> {
		return new Response("Hello cron trigger Worker playground!");
	}

	override async scheduled() {
		console.log("Cron processed");
	}
}
