import { bindings, defineConfig, exports } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "rpc",
		compatibilityDate: "2026-10-19",
		entrypoint,
		env: {
			KV_NAMESPACE: bindings.kv({
				id: "00000000000000000000000000000000",
			}),
		},
		exports: {
			TestObject: exports.durableObject({ storage: "legacy-kv" }),
			ProxiedTestObject: exports.durableObject({ storage: "legacy-kv" }),
		},
	},
});
