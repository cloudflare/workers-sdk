import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "react-router",
		compatibilityDate: "2026-10-23",
		observability: {
			enabled: true,
		},
		entrypoint: "./workers/app.ts",
	},
});
