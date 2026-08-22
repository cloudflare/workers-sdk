import {
	defineSettings,
	defineWorker,
} from "@cloudflare/vite-plugin/experimental-config";

export const settings = defineSettings({
	accountId: "not-a-valid-account-id-abc",
});

export default defineWorker({
	name: "cloudflare-vite-e2e-remote-bindings-config-account-id-worker",
	entrypoint: "./src/index.ts",
	compatibilityDate: "2024-12-30",
	compatibilityFlags: ["nodejs_compat"],
	env: {
		REMOTE_WORKER: {
			type: "worker",
			worker: "MY_REMOTE_WORKER",
			dev: { remote: true },
		},
	},
});
