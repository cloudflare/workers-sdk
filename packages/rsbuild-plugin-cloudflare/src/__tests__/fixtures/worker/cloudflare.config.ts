import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "rsbuild-worker",
		entrypoint,
		compatibilityDate: "2025-06-01",
		compatibilityFlags: ["nodejs_compat"],
		env: {
			KV: bindings.kv(),
			GREETING: bindings.text("Hello"),
			SECRET: bindings.secret(),
		},
	},
});
