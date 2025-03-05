export default {
	async fetch() {
		const staticPathImport = await import("./another");
		const dynamicPath = new URL("./another.js", import.meta.url).href;
		const dynamicPathImport = await import(/* @vite-ignore */ dynamicPath);

		return Response.json({
			staticPathImportResult: staticPathImport.name,
			dynamicPathImportResult: dynamicPathImport.name,
		});
	},
} satisfies ExportedHandler;
