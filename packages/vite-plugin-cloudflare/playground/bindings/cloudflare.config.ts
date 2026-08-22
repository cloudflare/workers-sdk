import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "primary-worker",
	entrypoint,
	compatibilityDate: "2024-12-30",
	env: {
		KV: { type: "kv", id: "test-kv-id" },
		BUCKET: { type: "r2", name: "s3-test-bucket" },
		IMAGES: { type: "images" },
		WAE: { type: "analytics-engine-dataset", name: "test" },
		// TODO: Reinstate when .env and .dev.vars files are supported with
		// cloudflare.config.ts.
		// HYPERDRIVE: { type: "hyperdrive", id: "test-hyperdrive-id" },
		RATE_LIMITER: {
			type: "rate-limit",
			namespace: "1001",
			simple: { limit: 1, period: 60 },
		},
	},
});
