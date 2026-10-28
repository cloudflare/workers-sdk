import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "hyperdrive",
		compatibilityDate: "2026-10-19",
		entrypoint,
		env: {
			ECHO_SERVER_HYPERDRIVE: bindings.hyperdrive({
				id: "00000000000000000000000000000000",
				dev: {
					connectionString: "postgres://user:pass@127.0.0.1/db", // Overridden in `vitest.config.ts`
				},
			}),
		},
	},
});
