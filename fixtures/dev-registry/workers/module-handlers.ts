export default {
	async fetch(request, env) {
		try {
			const testMethod = request.headers.get("test-method");
			const objectName = request.headers.get("test-object-name");

			// Remove the test-method header to avoid sending it to the service
			request.headers.delete("test-method");
			request.headers.delete("test-object-name");

			// To test tail handler
			console.log(
				`Fetch Handler / ${request.method} ${request.url} / test-method=${testMethod}; test-object-name=${objectName}`
			);

			if (objectName) {
				const id = env.DO.idFromName(objectName);
				const stub = env.DO.get(id);

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
				const result = await env.SERVICE.ping(request);
				return new Response(result);
			}

			if (testMethod === "fetch") {
				return await this.env.SERVICE.fetch(request);
			}

			return Response.json({
				greeting: "Hello from Fetch Handler!",
				body: await request.json(),
			});
		} catch (ex) {
			return new Response(`Error: ${ex}`, { status: 500 });
		}
	},
	tail(events, env) {
		const request = new Request("https://example.com", {
			method: "POST",
			body: JSON.stringify({
				greeting: "Hello from Tail Handler!",
				body: events,
			}),
		});

		env.SERVICE.fetch(request);
	},
} satisfies ExportedHandler<{ SERVICE: Fetcher; DO: DurableObjectNamespace }>;
