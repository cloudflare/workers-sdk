export default {
	async fetch() {
		return new Response("Worker response");
	},
} satisfies ExportedHandler;
