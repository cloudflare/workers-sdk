export default {
	async fetch() {
		return new Response("Hello world");
	},
} satisfies ExportedHandler;
