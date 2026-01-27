import { cleanUrl, createPlugin } from "../utils";

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
			handler(id) {
				if (!id.endsWith(".wasm?init")) {
					return;
				}

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
