import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "rr-851-fresh",
		compatibilityDate: "2026-10-23",
		observability: {
			enabled: true,
		},
		entrypoint: "./workers/app.ts",
	},
});
