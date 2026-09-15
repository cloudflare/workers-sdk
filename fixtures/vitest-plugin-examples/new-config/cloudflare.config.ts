import { bindings, defineWorker } from "wrangler/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "vitest-plugin-new-config",
	entrypoint,
	compatibilityDate: "2025-12-02",
	compatibilityFlags: ["nodejs_compat"],
	env: {
		MY_TEXT: bindings.text("from cloudflare.config.ts"),
		MY_KV: bindings.kv({ id: "vitest-plugin-new-config-kv" }),
	},
});
