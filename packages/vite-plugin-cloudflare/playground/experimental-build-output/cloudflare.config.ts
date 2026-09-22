import {
	bindings,
	defineConfig,
	defineContainer,
	exports as workerExports,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

const MANAGED_IMAGE_REFERENCE =
	"registry.cloudflare.com/account/api@sha256:" + "a".repeat(64);

const apiContainer = defineContainer(({ mode }) => ({
	name: "build-output",
	schedulingPolicy: "durable-object",
	images:
		mode === "production"
			? { api: { reference: MANAGED_IMAGE_REFERENCE } }
			: undefined,
}));

// This fixture checks Container build output without starting Containers locally.
export default defineConfig(({ mode }) => ({
	worker: {
		name: "build-output-worker",
		entrypoint,
		compatibilityDate: "2026-05-18",
		exports: {
			ApiContainer: workerExports.durableObject({
				storage: "sqlite",
				container: mode === "production" ? apiContainer : undefined,
			}),
		},
		env: {
			MY_TEXT: bindings.text("hello from text binding"),
		},
	},
	containers: mode === "production" ? [apiContainer] : [],
}));
