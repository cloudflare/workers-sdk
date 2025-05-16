export default {
	async fetch() {
		return new Response("Hello from Vite!");
	},
} satisfies ExportedHandler;
