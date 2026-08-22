import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { auxiliaryWorkerConfig } from "./worker-configs";

export default defineConfig({
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			auxiliaryWorkers: [{ config: auxiliaryWorkerConfig }],
			inspectorPort: false,
			persistState: false,
		}),
	],
});
