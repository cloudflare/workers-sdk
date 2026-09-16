import {
	bindings,
	defineContainer,
	defineWorker,
	exports as workerExports,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export const apiContainer = defineContainer({
	name: "build-output-api",
	image: { reference: "registry.example.com/api:latest" },
});

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
