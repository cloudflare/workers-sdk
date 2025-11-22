export default {
	async fetch() {
		return new Response("Hello");
	},
} satisfies ExportedHandler;
