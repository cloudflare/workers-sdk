import { cleanUrl } from "../utils";
import type { Context } from "../context";
import type * as vite from "vite";

/**
 * Plugin to support the `.wasm?init` extension
 */
export function wasmHelper(ctx: Context): vite.Plugin {
	return {
		name: "vite-plugin-cloudflare:wasm-helper",
		enforce: "pre",
		applyToEnvironment(environment) {
			return ctx.getWorkerConfig(environment.name) !== undefined;
		},
		load(id) {
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
	};
}
