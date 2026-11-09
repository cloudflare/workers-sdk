import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "api-worker",
		entrypoint,
		compatibilityDate: "2026-06-01",
		triggers: [{ type: "fetch", pattern: "api.example.com/v1/*" }],
		env: {
			STORE: bindings.kv({ id: "shared-store" }),
			DATABASE: bindings.d1({ id: "fake-database-id" }),
		},
	},
});
