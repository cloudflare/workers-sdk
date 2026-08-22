import {
	bindings,
	defineWorker,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "primary-worker",
	entrypoint,
	compatibilityDate: "2024-12-30",
	env: {
		KV: bindings.kv({ id: "test-kv-id" }),
		BUCKET: bindings.r2({
			name: "s3-test-bucket",
			dev: {
				experimentalS3Credentials: {
					accessKeyId: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
					secretAccessKey: "local-secret-access-key",
				},
			},
		}),
		IMAGES: bindings.images(),
		WAE: bindings.analyticsEngineDataset({ name: "test" }),
		// TODO: Reinstate when .env and .dev.vars files are supported with
		// cloudflare.config.ts.
		// HYPERDRIVE: bindings.hyperdrive({ id: "test-hyperdrive-id" }),
		RATE_LIMITER: bindings.rateLimit({
			namespace: "1001",
			simple: { limit: 1, period: 60 },
		}),
	},
});
