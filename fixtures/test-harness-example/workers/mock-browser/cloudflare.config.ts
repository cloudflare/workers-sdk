import { defineConfig } from "cf/config";
import * as entrypoint from "./index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "mock-browser",
		entrypoint,
		compatibilityDate: "2026-06-01",
	},
});
