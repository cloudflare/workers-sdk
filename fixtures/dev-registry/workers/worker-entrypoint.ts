import { WorkerEntrypoint } from "cloudflare:workers";

let tailEvents = [];

export default class Worker extends WorkerEntrypoint<{
	SERVICE_WORKER: Fetcher;
	MODULE_WORKER: Fetcher;
	WORKER_ENTRYPOINT_A: Fetcher;
	WORKER_ENTRYPOINT_B: Fetcher;
}> {
	ping() {
		return "Pong";
	}

	async fetch(request) {
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
					service = this.env.SERVICE_WORKER;
					break;
				}
				case "module-worker": {
					service = this.env.MODULE_WORKER;
					break;
				}
				case "worker-entrypoint-a": {
					service = this.env.WORKER_ENTRYPOINT_A;
					break;
				}
				case "worker-entrypoint-b": {
					service = this.env.WORKER_ENTRYPOINT_B;
					break;
				}
			}

			if (service && testMethod === "rpc") {
				// @ts-expect-error
				const result = await service.ping();
				return new Response(result);
			}

			if (service && testMethod === "fetch") {
				return await service.fetch(url, request);
			}

			if (testMethod === "tail") {
				if (request.method === "POST") {
					const logs = await request.json();
					if (Array.isArray(logs)) {
						console.log(`[Worker Entrypoint]`);
						console.log(...logs);
					}
					return new Response("ok");
				}

				return Response.json({
					worker: "Worker Entrypoint",
					tailEvents,
				});
			}

			return new Response("Hello from Worker Entrypoint!");
		} catch (e) {
			return new Response(e.message, { status: 500 });
		}
	}

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
	}
}
