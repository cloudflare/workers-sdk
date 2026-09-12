import {
	bindings,
	defineContainer,
	defineWorker,
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
	env: {
		MY_TEXT: bindings.text("hello from text binding"),
	},
});
