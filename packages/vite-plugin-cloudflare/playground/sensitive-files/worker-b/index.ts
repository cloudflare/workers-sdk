export default {
	async fetch() {
		return new Response("Worker B response");
	},
} satisfies ExportedHandler;
