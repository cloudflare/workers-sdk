import { WorkerEntrypoint } from "cloudflare:workers";

export default class extends WorkerEntrypoint {
	override async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// Used by the `cf-worker-header.spec.ts` regression test for
		// https://github.com/cloudflare/workers-sdk/issues/13791. The request
		// URL — including the side server's port — is supplied as a query
		// parameter so the test controls the fixture endpoint dynamically.
		if (url.pathname === "/cf-worker-header") {
			const echoUrl = url.searchParams.get("echoUrl");
			if (!echoUrl) {
				return new Response("missing echoUrl", { status: 400 });
			}
			return fetch(echoUrl);
		}

		return new Response("Hello cron trigger Worker playground!");
	}

	override async scheduled() {
		console.log("Cron processed");
	}
}
