export default {
	fetch() {
		return new Response("Hello from the auxiliary Worker");
	},
} satisfies ExportedHandler;
