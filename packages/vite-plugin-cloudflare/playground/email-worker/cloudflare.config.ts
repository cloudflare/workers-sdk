import {
	bindings,
	defineConfig,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "email-worker",
		entrypoint,
		compatibilityDate: "2025-02-14",
		compatibilityFlags: ["nodejs_compat"],
		env: {
			EMAIL: bindings.sendEmail({
				allowedDestinationAddresses: ["recipient@example.com"],
			}),
		},
	},
});
