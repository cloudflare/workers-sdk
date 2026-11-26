import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "browser-run-quick-actions",
		entrypoint,
		compatibilityDate: "2026-03-24",
		env: {
			MYBROWSER: bindings.browser(),
		},
	},
});
