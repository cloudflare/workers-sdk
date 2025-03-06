import textContent from "./text-file.txt";

export default {
	async fetch() {
		return new Response(textContent);
	},
} satisfies ExportedHandler;
