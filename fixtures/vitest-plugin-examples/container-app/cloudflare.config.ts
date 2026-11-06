import {
	bindings,
	defineConfig,
	defineContainer,
	exports as workerExports,
} from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

const namedImageContainer = defineContainer({
	name: "named-image-container",
	schedulingPolicy: "durable-object",
	images: { app: { dockerfile: "./Dockerfile" } },
});

const defaultImageContainer = defineContainer({
	name: "default-image-container",
	image: { dockerfile: "./Dockerfile" },
	maxInstances: 2,
});

export default defineConfig({
	containers: [namedImageContainer, defaultImageContainer],
	worker: {
		name: "container-app",
		entrypoint,
		compatibilityDate: "2025-12-02",
		env: {
			NAMED_CONTAINER: bindings.durableObject({
				worker: "container-app",
				exportName: "NamedImageContainer",
			}),
			DEFAULT_CONTAINER: bindings.durableObject({
				worker: "container-app",
				exportName: "DefaultImageContainer",
			}),
		},
		exports: {
			NamedImageContainer: workerExports.durableObject({
				storage: "sqlite",
				container: namedImageContainer,
			}),
			DefaultImageContainer: workerExports.durableObject({
				storage: "sqlite",
				container: defaultImageContainer,
			}),
		},
	},
});
