import {
	bindings,
	defineContainer,
	defineWorker,
	exports as workerExports,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

const MANAGED_IMAGE_REFERENCE =
	"registry.cloudflare.com/account/api@sha256:" + "a".repeat(64);

export const apiContainer = defineContainer(({ mode }) => ({
	name: "build-output-api",
	schedulingPolicy: "durable-object",
	images:
		mode === "production"
			? { api: { reference: MANAGED_IMAGE_REFERENCE } }
			: undefined,
}));

export default defineWorker({
	name: "build-output-worker",
	entrypoint,
	compatibilityDate: "2026-05-18",
	exports: {
		ApiContainer: workerExports.durableObject({
			storage: "sqlite",
			container: apiContainer,
		}),
	},
	env: {
		MY_TEXT: bindings.text("hello from text binding"),
	},
});
