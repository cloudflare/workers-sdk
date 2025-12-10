interface Env {
	APP: Fetcher;
}

export default {
	async fetch(request, env): Promise<Response> {
		return env.APP.fetch(request);
	},
} satisfies ExportedHandler<Env>;
