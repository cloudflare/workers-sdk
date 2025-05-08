export default {
	async fetch() {
		return new Response("Hello from Remote Worker!");
	},
} satisfies ExportedHandler;
