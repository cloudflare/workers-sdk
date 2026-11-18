import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "worker",
		entrypoint: "./src/index.ts",
		compatibilityDate: "2024-12-30",
	},
});
