import { bindings, defineConfig, defineContainer, exports } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

const container = defineContainer({
	name: "container",
	image: { dockerfile: "./Dockerfile" },
	maxInstances: 2,
});

export default defineConfig({
	worker: {
		name: "container-app",
		compatibilityDate: "2026-10-19",
		entrypoint,
		env: {
			MY_CONTAINER: bindings.durableObject({
				worker: "container-app",
				exportName: "MyContainer",
			}),
		},
		exports: {
			MyContainer: exports.durableObject({ storage: "sqlite", container }),
		},
	},
	containers: [container],
});
