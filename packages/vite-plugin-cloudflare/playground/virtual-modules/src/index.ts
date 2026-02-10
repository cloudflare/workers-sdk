export default {
	async fetch() {
		// @ts-expect-error virtual module
		const virtualModule = await import("virtual:module");
		return new Response(virtualModule.default);
	},
} satisfies ExportedHandler;
