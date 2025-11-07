import { data, text } from "./blobs-indirect.mjs";
// Test `ImportDeclaration`
import cjs from "./index.cjs";

export default {
	async fetch() {
		// Test `ImportExpression`
		const addModule = await import("./add.wasm");
		const addInstance = new WebAssembly.Instance(addModule.default);
		const number = addInstance.exports.add(1, 2);

		// Test dynamic variable import (after all other imports to ensure error
		// message includes suggestions for adding all modules manually)
		await import("./" + "add.wasm");

		return Response.json({
			text: cjs.base64Decode(cjs.base64Encode(text)),
			data: Array.from(new Uint8Array(data)),
			number,
		});
	},
};
