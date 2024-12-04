// this is from the `import-wasm-static` fixture defined above
// and setup inside package.json to mimic an npm package
import multiply from "import-wasm-static/multiply.wasm";

export default {
	async fetch(request) {
		// just instantiate and return something
		// we're really just testing the imports at the top of this file
		const multiplyModule = await WebAssembly.instantiate(multiply);

		const results = [
			multiplyModule.exports.multiply(7, 3),
		];
		return new Response(results.join(", "));
	},
};
