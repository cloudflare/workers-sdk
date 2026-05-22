import {
	defineConfig,
	bindings,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig((ctx) => ({
	name: "experimental-config-worker",
	entrypoint,
	compatibilityDate: "2026-05-18",
	env: {
		MY_TEXT: bindings.text(`The mode is ${ctx.mode}`),
	},
}));
