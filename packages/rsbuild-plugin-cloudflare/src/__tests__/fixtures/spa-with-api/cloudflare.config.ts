import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./api/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "rsbuild-spa-with-api",
		entrypoint,
		compatibilityDate: "2025-06-01",
		assets: { notFoundHandling: "single-page-application" },
		env: { ASSETS: bindings.assets() },
	},
});
