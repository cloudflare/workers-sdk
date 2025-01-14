export default {
	async fetch() {
		console.log("__console log__");
		console.warn("__console warn__");
		console.error("__console error__");

		return new Response("Hello World!");
	},
} satisfies ExportedHandler;
