import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "worker",
		entrypoint,
		compatibilityDate: "2024-12-30",
		access: {
			dev: {
				aud: "vite-plugin-test-audience",
				identity: {
					email: "vite-plugin@example.com",
					name: "Vite Plugin Test User",
				},
			},
		},
		env: {
			TEST_IF_VITE_CRASH_WITH_UNKNOWN_NAMED_ENTRYPOINT: bindings.worker({
				worker: "unknown-worker",
				exportName: "NamedEntrypoint",
			}),
		},
	},
});
