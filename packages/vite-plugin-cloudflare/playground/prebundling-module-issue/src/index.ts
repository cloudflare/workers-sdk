import { setup } from "@packages/lib-a";

setup();

export default {
	async fetch() {
		const { msg } = await import("virtual:my-module");
		return new Response(`Message from virtual module: "${msg}"`);
	},
} satisfies ExportedHandler;
