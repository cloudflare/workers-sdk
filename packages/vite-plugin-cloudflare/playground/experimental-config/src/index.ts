export default {
	fetch() {
		return new Response("Hello from worker.config.ts");
	},
} satisfies ExportedHandler;
