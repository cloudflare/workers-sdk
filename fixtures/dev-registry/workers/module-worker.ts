import { WorkerEntrypoint } from "cloudflare:workers";

let tailEvents = [];

export class NamedEntrypoint extends WorkerEntrypoint {
	ping() {
		return "Pong from Named Entrypoint";
	}

	fetch() {
		return new Response("Hello from Named Entrypoint!");
	}
}

export default {
	async fetch(request, env) {
		try {
			const url = new URL(request.url);
			const testMethod = url.searchParams.get("test-method");
			const testService = url.searchParams.get("test-service");

			// Remove the test-method search params to avoid recursion
			url.searchParams.delete("test-method");
			url.searchParams.delete("test-service");

			let service: Fetcher | undefined;

			switch (testService) {
				case "service-worker": {
					service = env.SERVICE_WORKER;
					break;
				}
				case "module-worker": {
					service = env.MODULE_WORKER;
					break;
				}
				case "worker-entrypoint": {
					service = env.WORKER_ENTRYPOINT;
					break;
				}
				case "worker-entrypoint-with-assets": {
					service = env.WORKER_ENTRYPOINT_WITH_ASSETS;
					break;
				}
				case "named-entrypoint": {
					service = env.NAMED_ENTRYPOINT;
					break;
				}
				case "named-entrypoint-with-assets": {
					service = env.NAMED_ENTRYPOINT_WITH_ASSETS;
					break;
				}
			}

			if (service && testMethod === "rpc") {
				// @ts-expect-error
				const result = await service.ping();
				return new Response(result);
			}

			if (service && testMethod === "fetch") {
				return await service.fetch(url);
			}

			if (testMethod === "tail") {
				if (request.method === "POST") {
					const logs = await request.json();
					if (Array.isArray(logs)) {
						console.log(`[Module Worker]`);
						console.log(...logs);
					}
					return new Response("ok");
				}

				try {
					return Response.json({
						worker: "Module Worker",
						tailEvents,
					});
				} finally {
					// Clear the tail events after sending them
					tailEvents = [];
				}
			}

			return new Response("Hello from Module Worker!");
		} catch (e) {
			return new Response(e.message, { status: 500 });
		}
	},
	tail(events) {
		const logs = [];

		for (const event of events) {
			if (Array.isArray(event.logs) && event.logs.length > 0) {
				logs.push(...event.logs.map((log) => log.message));
			}
		}

		if (logs.length > 0) {
			tailEvents.push(logs);
		}
	},
} satisfies ExportedHandler<{
	SERVICE_WORKER: Fetcher;
	MODULE_WORKER: Fetcher;
	WORKER_ENTRYPOINT: Fetcher;
	WORKER_ENTRYPOINT_WITH_ASSETS: Fetcher;
	NAMED_ENTRYPOINT: Fetcher;
	NAMED_ENTRYPOINT_WITH_ASSETS: Fetcher;
}>;
