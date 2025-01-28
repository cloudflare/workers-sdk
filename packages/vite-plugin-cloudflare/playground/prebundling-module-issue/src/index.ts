import * as libA from "@packages/lib-a";

(globalThis as unknown as { context: {} }).context = libA.context;

export default {
	async fetch() {
		// @ts-ignore
		const { msg }: { msg: string } = await import("virtual:my-module");
		return new Response(`Message from virtual module: "${msg}"`);
	},
} satisfies ExportedHandler;
