import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "cloudflare-vite-e2e-dynamic",
		entrypoint: "./src/index.ts",
		compatibilityDate: "2024-12-30",
		compatibilityFlags: ["nodejs_compat"],
	},
});
