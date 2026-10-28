import { bindings, defineConfig, exports } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "reset",
		compatibilityDate: "2026-10-19",
		entrypoint,
		env: {
			DATABASE: bindings.d1({
				name: "database",
				id: "00000000-0000-0000-0000-000000000000",
			}),
			KV_NAMESPACE: bindings.kv({
				id: "00000000000000000000000000000000",
			}),
			R2_BUCKET: bindings.r2({
				name: "bucket",
			}),
			COUNTER: bindings.durableObject({
				worker: "reset",
				exportName: "Counter",
			}),
			RATE_LIMITER: bindings.rateLimit({
				namespace: "1",
				simple: {
					limit: 100,
					period: 60,
				},
			}),
			// Deliberately shares namespace "1" with RATE_LIMITER: two bindings
			// pointing at the same namespace must share a single counter.
			RATE_LIMITER_ALIAS: bindings.rateLimit({
				namespace: "1",
				simple: {
					limit: 100,
					period: 60,
				},
			}),
		},
		exports: {
			Counter: exports.durableObject({ storage: "legacy-kv" }),
		},
	},
});
