import {
	defineConfig,
	defineContainer,
	exports as workerExports,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./index.js" with { type: "cf-worker" };

const probeContainer = defineContainer({
	name: "probe",
	schedulingPolicy: "durable-object",
});

export default defineConfig({
	containers: [probeContainer],
	worker: {
		name: "containers-image-free",
		entrypoint,
		compatibilityDate: "2026-09-21",
		exports: {
			Probe: workerExports.durableObject({
				storage: "sqlite",
				container: probeContainer,
			}),
		},
	},
});
