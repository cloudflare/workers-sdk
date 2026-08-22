import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { auxiliaryWorkerConfig } from "./worker-configs";

export default defineConfig({
	server: {
		fs: {
			deny: ["custom-sensitive-file"],
		},
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			inspectorPort: false,
			persistState: false,
			auxiliaryWorkers: [{ config: auxiliaryWorkerConfig }],
		}),
	],
});
