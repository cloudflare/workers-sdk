import {
	bindings,
	defineConfig,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./entry-worker/src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "cloudflare-vite-e2e-remote-bindings-entry-worker",
		entrypoint,
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
	},
});
