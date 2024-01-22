import { sayHello } from "../say-hello.js";
import subWasm from "../simple.wasm";
import cjs from "./say-hello.js";
import sibWasm from "./simple.wasm";

export const johnSmith =
	sayHello("John Smith") === cjs.sayHello("John Smith")
		? sayHello("John Smith")
		: false;

export async function loadWasm() {
	const sibling = await new Promise(async (resolve) => {
		const moduleImport = {
			imports: {
				imported_func(arg) {
					resolve("sibling" + arg);
				},
			},
		};
		const m = await WebAssembly.instantiate(sibWasm, moduleImport);
		m.exports.exported_func();
	});

	const subdirectory = await new Promise(async (resolve) => {
		const moduleImport = {
			imports: {
				imported_func(arg) {
					resolve("subdirectory" + arg);
				},
			},
		};
		const m = await WebAssembly.instantiate(subWasm, moduleImport);
		m.exports.exported_func();
	});
	return sibling + subdirectory;
}
