import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./api/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "worker",
		entrypoint,
		compatibilityDate: "2025-06-04",
		assets: { notFoundHandling: "single-page-application" },
		env: { ASSETS: bindings.assets() },
	},
});
