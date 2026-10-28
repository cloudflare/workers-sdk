import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "kv-r2-caches",
		compatibilityDate: "2026-10-19",
		entrypoint,
		env: {
			KV_NAMESPACE: bindings.kv({
				id: "00000000000000000000000000000000",
			}),
			R2_BUCKET: bindings.r2({
				name: "bucket",
			}),
		},
	},
});
