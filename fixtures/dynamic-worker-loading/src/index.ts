export interface Env {
	LOADER: {
		get(
			id: string,
			factory: () => unknown
		): {
			getEntrypoint(): Fetcher;
		};
	};
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		let worker = env.LOADER.get(url.pathname, () => {
			return {
				compatibilityDate: "2025-06-01",

				mainModule: "foo.js",

				modules: {
					"foo.js":
						"export default {\n" +
						`  fetch(req, env, ctx) { return new Response('Hello with a dynamic worker loaded for ${url.pathname}'); }\n` +
						"}\n",
				},
			};
		});

		let defaultEntrypoint = worker.getEntrypoint();
		return await defaultEntrypoint.fetch(request);
	},
};
