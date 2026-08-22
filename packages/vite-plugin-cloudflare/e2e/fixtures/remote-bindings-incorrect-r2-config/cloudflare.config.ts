import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";

export default defineWorker({
	name: "cloudflare-vite-e2e-remote-bindings-disabled",
	entrypoint: "./src/index.ts",
	compatibilityDate: "2024-12-30",
	compatibilityFlags: ["nodejs_compat"],
	env: {
		MY_R2: {
			type: "r2",
			name: "non-existent-r2-bucket",
			dev: { remote: true },
		},
	},
});
