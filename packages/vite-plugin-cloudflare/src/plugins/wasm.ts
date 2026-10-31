import { cleanUrl, createPlugin } from "../utils";

const wasmInitRE = /\.wasm\?init$/;

/**
 * Plugin to support the `.wasm?init` extension
 */
export const wasmHelperPlugin = createPlugin("wasm-helper", (ctx) => {
	return {
		enforce: "pre",
		applyToEnvironment(environment) {
			return ctx.getWorkerConfig(environment.name) !== undefined;
		},
		load: {
			filter: { id: wasmInitRE },
			handler(id) {
				return `
					import wasm from "${cleanUrl(id)}";
					export default function(opts = {}) {
						return WebAssembly.instantiate(wasm, opts);
					}
				`;
			},
		},
	};
});
