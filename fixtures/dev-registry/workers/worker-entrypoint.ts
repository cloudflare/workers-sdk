import { WorkerEntrypoint } from "cloudflare:workers";

export default class Worker extends WorkerEntrypoint<{
	SERVICE: Fetcher;
	DO: DurableObjectNamespace;
}> {
	ping() {
		return "Pong";
	}

	async fetch(request) {
		try {
			const testMethod = request.headers.get("test-method");
			const objectName = request.headers.get("test-object-name");

			// Remove the test-method header to avoid sending it to the service
			request.headers.delete("test-method");
			request.headers.delete("test-object-name");

			// To test tail handler
			console.log(
				`Worker Entrypoint / ${request.method} ${request.url} / test-method=${testMethod}; test-object-name=${objectName}`
			);

			if (objectName) {
				const id = this.env.DO.idFromName(objectName);
				const stub = this.env.DO.get(id);

				switch (testMethod) {
					case "rpc": {
						// @ts-expect-error
						const result = await stub.ping(request);
						return new Response(result);
					}
					case "fetch": {
						return await stub.fetch(request);
					}
				}
			}

			if (testMethod === "rpc") {
				// @ts-expect-error
				const result = await this.env.SERVICE.ping(request);
				return new Response(result);
			}

			if (testMethod === "fetch") {
				return await this.env.SERVICE.fetch(request);
			}

			return Response.json({
				greeting: "Hello from Worker Entrypoint!",
				body: await request.json(),
			});
		} catch (ex) {
			return new Response(`Error: ${ex}`, { status: 500 });
		}
	}

	tail(events) {
		const request = new Request("https://example.com", {
			method: "POST",
			body: JSON.stringify({
				greeting: "Hello from Worker Entrypoint (Tail)!",
				body: events,
			}),
		});

		this.env.SERVICE.fetch(request);
	}
}
