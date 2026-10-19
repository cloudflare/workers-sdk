import { getWasmInitModule, wasmInitRE } from "@cloudflare/workers-dev-shared";
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
			filter: { id: wasmInitRE },
			handler(id) {
				return getWasmInitModule(cleanUrl(id));
			},
		},
	};
});
