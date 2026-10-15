import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/new-module-registry",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: { compatibilityFlags: ["new_module_registry"] },
			inspectorPort: false,
			persistState: false,
		}),
	],
});
