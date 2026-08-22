import {
	bindings,
	defineWorker,
} from "@cloudflare/vite-plugin/experimental-config";
import * as auxiliaryWorkerEntrypoint from "./auxiliary-worker/src/index.ts" with { type: "cf-worker" };
import * as entryWorkerEntrypoint from "./entry-worker/src/index.ts" with { type: "cf-worker" };

export const auxiliaryWorker = defineWorker({
	name: "cloudflare-vite-e2e-remote-bindings-auxiliary-worker",
	entrypoint: auxiliaryWorkerEntrypoint,
	compatibilityDate: "2024-12-30",
	compatibilityFlags: ["nodejs_compat"],
	env: {
		REMOTE_WORKER: bindings.worker({
			worker: "<<REMOTE_WORKER_PLACEHOLDER_ALT>>",
			dev: { remote: true },
		}),
	},
});

export default defineWorker({
	name: "cloudflare-vite-e2e-remote-bindings-entry-worker",
	entrypoint: entryWorkerEntrypoint,
	compatibilityDate: "2024-12-30",
	compatibilityFlags: ["nodejs_compat"],
	env: {
		AI: bindings.ai({ dev: { remote: true } }),
		LOCAL_WORKER: bindings.worker({
			worker: "cloudflare-vite-e2e-remote-bindings-auxiliary-worker",
		}),
		REMOTE_WORKER: bindings.worker({
			worker: "<<REMOTE_WORKER_PLACEHOLDER>>",
			dev: { remote: true },
		}),
	},
});
