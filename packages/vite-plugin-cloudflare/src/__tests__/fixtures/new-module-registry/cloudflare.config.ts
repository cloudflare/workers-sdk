import { defineConfig } from "@cloudflare/config";

export default defineConfig({
	worker: {
		name: "new-module-registry-worker",
		entrypoint: "./index.ts",
		compatibilityDate: "2024-12-30",
		compatibilityFlags: ["nodejs_compat", "new_module_registry"],
	},
});
