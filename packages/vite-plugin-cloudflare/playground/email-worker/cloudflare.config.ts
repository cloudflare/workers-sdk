import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "email-worker",
	entrypoint,
	compatibilityDate: "2025-02-14",
	compatibilityFlags: ["nodejs_compat"],
	env: {
		EMAIL: {
			type: "send-email",
			allowedDestinationAddresses: ["recipient@example.com"],
		},
	},
});
