import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "images",
		compatibilityDate: "2026-10-19",
		entrypoint,
		env: {
			IMAGES: bindings.images(),
		},
	},
});
