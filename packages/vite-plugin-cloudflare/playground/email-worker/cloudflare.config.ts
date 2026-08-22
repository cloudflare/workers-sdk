import {
	bindings,
	defineWorker,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "email-worker",
	entrypoint,
	compatibilityDate: "2025-02-14",
	compatibilityFlags: ["nodejs_compat"],
	env: {
		EMAIL: bindings.sendEmail({
			allowedDestinationAddresses: ["recipient@example.com"],
		}),
	},
});
