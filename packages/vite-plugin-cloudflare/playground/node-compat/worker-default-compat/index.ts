import assert from "node:assert/strict";
// Unprefixed import: only resolvable under Node.js compat v2, which is implied
// by the compatibility date without needing the `nodejs_compat` flag.
import { join } from "path";

export default {
	async fetch() {
		return testNodejsCompatDefault();
	},
} satisfies ExportedHandler;

function testNodejsCompatDefault() {
	assert(join("a", "b") === "a/b", "expected posix path joining");

	const buffer = Buffer.of(1);
	assert(buffer.toJSON().data[0] === 1, "Buffer global is broken");

	return new Response(`"OK!"`);
}
