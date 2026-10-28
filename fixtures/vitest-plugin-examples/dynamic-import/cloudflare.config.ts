import { bindings, defineConfig, exports } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "dynamic-import",
		compatibilityDate: "2026-10-19",
		entrypoint,
		env: {
			GREETER: bindings.durableObject({
				worker: "dynamic-import",
				exportName: "GreeterDO",
			}),
		},
		exports: {
			GreeterDO: exports.durableObject({ storage: "legacy-kv" }),
		},
	},
});
