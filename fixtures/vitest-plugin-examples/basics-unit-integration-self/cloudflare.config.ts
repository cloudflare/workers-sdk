import { defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "basics-unit-integration-self",
		compatibilityDate: "2026-10-19",
		entrypoint,
	},
});
