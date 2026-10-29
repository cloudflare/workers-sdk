import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "static",
		compatibilityDate: "2024-12-30",
		assets: {},
	},
});
