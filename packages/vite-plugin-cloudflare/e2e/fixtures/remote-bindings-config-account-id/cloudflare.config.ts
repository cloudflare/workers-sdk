import {
	bindings,
	defineConfig,
} from "@cloudflare/vite-plugin/experimental-config";

export default defineConfig({
	accountId: "not-a-valid-account-id-abc",
	worker: {
		name: "cloudflare-vite-e2e-remote-bindings-config-account-id-worker",
		entrypoint: "./src/index.ts",
		compatibilityDate: "2024-12-30",
		compatibilityFlags: ["nodejs_compat"],
		env: {
			REMOTE_WORKER: bindings.worker({
				worker: "MY_REMOTE_WORKER",
				dev: { remote: true },
			}),
		},
	},
});
