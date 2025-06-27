export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		switch (url.pathname) {
			case "/kv": {
				const value = Math.floor(Date.now() * Math.random()).toString(36);

				await env.KV.put("value", value);

				if (value !== (await env.KV.get("value"))) {
					return new Response("KV binding failed to set value", {
						status: 500,
					});
				}

				return new Response("KV binding works", {
					status: 200,
				});
			}
			case "/hello-world": {
				const value = Math.floor(Date.now() * Math.random()).toString(36);
				await env.HELLO_WORLD.set(value);

				const result = await env.HELLO_WORLD.get(value);
				if (value !== result.value) {
					return new Response("Hello World binding failed to set value", {
						status: 500,
					});
				}

				return new Response("Hello World binding works", {
					status: 200,
				});
			}
		}

		return new Response("Please specify a binding you want to test", {
			status: 400,
		});
	},
} satisfies ExportedHandler<Env>;
