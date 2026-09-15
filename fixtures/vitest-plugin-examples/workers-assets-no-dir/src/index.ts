export default {
	async fetch(request): Promise<Response> {
		return new Response("Hello from worker!");
	},
} satisfies ExportedHandler<Env>;
