import { bindings, defineWorker } from "wrangler/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineWorker((ctx) => ({
	name: "experimental-new-config",
	entrypoint,
	compatibilityDate: "2026-05-18",
	env: {
		MY_TEXT: bindings.text(`The mode is ${ctx.mode}`),
	},
}));
