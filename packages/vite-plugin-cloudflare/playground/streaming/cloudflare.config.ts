import { defineConfig } from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "worker",
		entrypoint,
		compatibilityDate: "2024-09-09",
	},
});
