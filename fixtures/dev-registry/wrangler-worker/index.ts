export default {
	async fetch() {
		return new Response("Hello from Wrangler!");
	},
} satisfies ExportedHandler;
