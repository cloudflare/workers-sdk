export default {
	async fetch() {
		// @ts-ignore
		const virtualModule = await import("virtual:module");

		return new Response(virtualModule.default);
	},
} satisfies ExportedHandler;
