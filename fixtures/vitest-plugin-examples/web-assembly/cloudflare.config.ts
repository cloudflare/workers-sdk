import { defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "web-assembly",
		compatibilityDate: "2026-10-19",
		entrypoint,
	},
});
