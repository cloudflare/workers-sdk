export default {
	async fetch() {
		const staticPathImport = await import("./another");
		const dynamicPath = "./another.js";
		const dynamicPathImport = await import(/* @vite-ignore */ dynamicPath);

		return Response.json({
			staticPathImportResult: staticPathImport.name,
			dynamicPathImportResult: dynamicPathImport.name,
		});
	},
} satisfies ExportedHandler;
