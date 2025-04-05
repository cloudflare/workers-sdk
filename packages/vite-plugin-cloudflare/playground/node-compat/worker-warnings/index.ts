import assert from "node:assert/strict";
// Check that we can actually import unenv polyfilled modules in user source.
import "perf_hooks";

export default {
	async fetch() {
		assert(true, "the world is broken");
		return new Response("OK!");
	},
} satisfies ExportedHandler;
