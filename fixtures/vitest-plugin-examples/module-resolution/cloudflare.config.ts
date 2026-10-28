import { defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "module-resolution",
		compatibilityDate: "2025-12-13",
		compatibilityFlags: ["nodejs_compat"],
		entrypoint,
	},
});
