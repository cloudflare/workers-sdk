import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "worker",
		entrypoint: "./index.js",
		compatibilityDate: "2024-12-30",
	},
});
