import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { auxiliaryWorkerConfig } from "./worker-configs";

export default defineConfig({
	plugins: [
		cloudflare({
			auxiliaryWorkers: [{ config: auxiliaryWorkerConfig }],
			inspectorPort: false,
			persistState: false,
		}),
	],
});
