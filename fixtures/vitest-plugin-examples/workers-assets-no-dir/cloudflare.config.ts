import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "workers-assets-no-directory",
		compatibilityDate: "2026-10-19",
		entrypoint,
		env: {
			// As in a project using @cloudflare/vite-plugin, the assets binding has no
			// directory: `cloudflare.config.ts` never configures one.
			ASSETS: bindings.assets(),
		},
	},
});
