import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
// Unprefixed import: only resolvable under Node.js compat v2, which is implied
// by the compatibility date without needing the `nodejs_compat` flag.
import { Stream } from "stream";

export default {
	async fetch(req: Request, env: unknown, ctx: ExecutionContext) {
		if (new URL(req.url).pathname !== "/") {
			return new Response("Not Found", { status: 404 });
		}

		// `node:` prefixed builtin
		const buffer = Buffer.from("nodejs", "utf8");
		assert.strictEqual(buffer.toString("base64"), "bm9kZWpz");

		// Unprefixed builtin (v2 only)
		const stream = new Stream();
		assert.ok(stream instanceof Stream);

		// `Buffer` global (v2 only)
		assert.strictEqual(typeof Buffer, "function");

		return new Response("OK");
	},
};
