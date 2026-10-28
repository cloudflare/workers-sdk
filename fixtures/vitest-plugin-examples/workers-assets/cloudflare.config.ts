import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "workers-static-assets-with-user-worker",
		compatibilityDate: "2026-10-19",
		entrypoint,
		assets: {
			htmlHandling: "auto-trailing-slash",
			notFoundHandling: "none",
		},
		env: {
			ASSETS: bindings.assets(),
		},
	},
});
