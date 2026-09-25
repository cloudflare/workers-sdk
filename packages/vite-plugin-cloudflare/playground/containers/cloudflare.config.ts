import {
	defineConfig,
	defineContainer,
	exports as workerExports,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

declare const process: {
	env: Record<string, string | undefined>;
};

const DEVPROD_TESTING_ACCOUNT_ID = "8d783f274e1f82dc46744c297b015a2f";
const includeRegistryContainer =
	process.env.CLOUDFLARE_ACCOUNT_ID === DEVPROD_TESTING_ACCOUNT_ID;

export const dockerfileContainer = defineContainer({
	name: "dockerfile-http",
	image: { dockerfile: "./Dockerfile" },
	maxInstances: 2,
});

export const registryContainer = defineContainer({
	name: "registry-http",
	image: {
		reference:
			"registry.cloudflare.com/8d783f274e1f82dc46744c297b015a2f/ci-container-dont-delete:latest",
	},
	maxInstances: 2,
});

export const namedImagesContainer = defineContainer({
	name: "named-images-http",
	schedulingPolicy: "durable-object",
	images: {
		app: { dockerfile: "./Dockerfile" },
	},
});

export default defineConfig({
	worker: {
		name: "containers",
		entrypoint,
		compatibilityDate: "2026-09-21",
		exports: {
			DockerfileContainer: workerExports.durableObject({
				storage: "sqlite",
				container: dockerfileContainer,
			}),
			NamedImagesContainer: workerExports.durableObject({
				storage: "sqlite",
				container: namedImagesContainer,
			}),
			RegistryContainer: workerExports.durableObject({
				storage: "sqlite",
				...(includeRegistryContainer ? { container: registryContainer } : {}),
			}),
		},
	},
	containers: [
		dockerfileContainer,
		namedImagesContainer,
		...(includeRegistryContainer ? [registryContainer] : []),
	],
});
