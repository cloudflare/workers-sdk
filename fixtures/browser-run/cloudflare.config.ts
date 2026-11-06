import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "browser-rendering",
		entrypoint,
		compatibilityDate: "2025-12-01",
		compatibilityFlags: ["nodejs_compat"],
		observability: { enabled: true },
		env: {
			MYBROWSER: bindings.browser(),
			BROWSER_KV_DEMO: bindings.kv({ id: "8a5482302d2e4bcb8186416eea7e38b1" }),
		},
	},
});
