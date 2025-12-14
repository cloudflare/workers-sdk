export default {
	async fetch() {
		// @ts-expect-error virtual module
		return new Response(virtualModule.default);
	},
} satisfies ExportedHandler;
