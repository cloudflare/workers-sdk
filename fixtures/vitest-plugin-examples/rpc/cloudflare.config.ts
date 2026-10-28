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
			TEST_OBJECT: bindings.durableObject({
				worker: "rpc",
				exportName: "TestObject",
			}),
			PROXIED_TEST_OBJECT: bindings.durableObject({
				worker: "rpc",
				exportName: "ProxiedTestObject",
			}),
			TEST_NAMED_HANDLER: bindings.worker({
				worker: "rpc",
				exportName: "testNamedHandler",
			}),
			TEST_NAMED_ENTRYPOINT: bindings.worker({
				worker: "rpc",
				exportName: "TestNamedEntrypoint",
			}),
		},
		exports: {
			TestObject: exports.durableObject({ storage: "legacy-kv" }),
			ProxiedTestObject: exports.durableObject({ storage: "legacy-kv" }),
		},
	},
});
