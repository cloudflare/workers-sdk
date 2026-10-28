import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "d1",
		compatibilityDate: "2026-10-19",
		entrypoint,
		env: {
			DATABASE: bindings.d1({
				name: "database",
				id: "00000000-0000-0000-0000-000000000000",
			}),
		},
	},
});
