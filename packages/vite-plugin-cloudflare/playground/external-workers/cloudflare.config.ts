import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "worker",
	entrypoint,
	compatibilityDate: "2024-12-30",
	env: {
		AI: { type: "ai", dev: { remote: true } },
		VECTORIZE: {
			type: "vectorize",
			name: "dummy-index",
			dev: { remote: true },
		},
		IMAGES: { type: "images", dev: { remote: true } },
	},
});
