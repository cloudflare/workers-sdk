// Test `ImportDeclaration` and `nodejs_compat`
import assert from "node:assert";

import { data, text } from "./blobs-indirect.mjs";
import cjs from "./index.cjs";

export default {
	async fetch() {
		assert(true);

		// Test `ImportExpression`
		const addModule = await import("./add.wasm");
		const addInstance = new WebAssembly.Instance(addModule.default);
		const number = addInstance.exports.add(1, 2);

		return Response.json({
			text: cjs.base64Decode(cjs.base64Encode(text)),
			data: Array.from(new Uint8Array(data)),
			number,
		});
	},
};
