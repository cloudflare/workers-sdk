import { bindings, defineConfig, triggers } from "cf/config";
import * as entrypoint from "./index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "web-worker",
		entrypoint,
		compatibilityDate: "2026-06-01",
		triggers: [triggers.fetch({ pattern: "example.com/*" })],
		env: {
			BROWSER: bindings.browser(),
			API: bindings.worker({ worker: "api-worker" }),
		},
	},
});
