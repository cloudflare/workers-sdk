export default {
	async fetch() {
		return new Response(navigator.userAgent);
	},
} satisfies ExportedHandler;
