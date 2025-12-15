import image from "./image.png?inline";

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
			case "/images": {
				const request = await fetch(image);

				if (!request.body) {
					return new Response("Failed to fetch image", { status: 500 });
				}

				const info = await env.IMAGES.info(request.body);

				if (info.format !== "image/png") {
					return new Response("Images binding returns an incorrect format", {
						status: 500,
					});
				}

				return new Response("Images binding works", {
					status: 200,
				});
			}
			case "/ae": {
				await env.WAE.writeDataPoint({ doubles: [2, 3] });

				return new Response("AE binding works", {
					status: 200,
				});
			}
			case "/rate-limit": {
				const { success: first } = await env.RATE_LIMITER.limit({
					key: "shared-key",
				});
				const { success: second } = await env.RATE_LIMITER.limit({
					key: "shared-key",
				});

				return new Response(
					`Rate limit binding works: first: ${first}, second: ${second}`,
					{
						status: 200,
					}
				);
			}
			case "/hyperdrive": {
				if (
					typeof env.HYPERDRIVE.connect !== "function" ||
					typeof env.HYPERDRIVE.connectionString !== "string"
				) {
					return new Response("Hyperdrive binding is not configured properly", {
						status: 500,
					});
				}

				return new Response("Hyperdrive binding works");
			}
			case "/hello-world": {
				const value = Math.floor(Date.now() * Math.random()).toString(36);
				await env.HELLO_WORLD.set(value);

				const result = await env.HELLO_WORLD.get();
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
