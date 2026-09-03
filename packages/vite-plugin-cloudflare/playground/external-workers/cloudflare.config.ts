import {
	bindings,
	defineWorker,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "worker",
	entrypoint,
	compatibilityDate: "2024-12-30",
	env: {
		AI: bindings.ai({ dev: { remote: true } }),
		VECTORIZE: bindings.vectorize({
			name: "dummy-index",
			dev: { remote: true },
		}),
		IMAGES: bindings.images({ dev: { remote: true } }),
	},
});
