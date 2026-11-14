import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "api-service",
		compatibilityDate: "2026-10-19",
		entrypoint,
		env: {
			AUTH_SERVICE: bindings.worker({ worker: "auth-service" }),
			DATABASE_SERVICE: bindings.worker({ worker: "database-service" }),
		},
		tailConsumers: [
			{ worker: "this-tail-does-not-exist" },
			{ worker: "tail-consumer" },
		],
	},
});
