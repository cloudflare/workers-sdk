import {
	defineConfig,
	bindings,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	name: "experimental-config-worker",
	entrypoint,
	compatibilityDate: "2024-12-30",
	env: {
		MY_TEXT: bindings.text("Hello world"),
	},
});
