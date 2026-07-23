import { defineConfig } from "@flue/cli/config";
import { defineConfig as defineViteConfig } from "vite";

export const vite = defineViteConfig({
	environments: {
		workers_sdk_flue: {
			optimizeDeps: {
				include: [
					"@cloudflare/codemode",
					"@cloudflare/shell",
					"@cloudflare/shell/workers",
					"@flue/runtime",
					"@flue/runtime/cloudflare",
					"@flue/runtime/routing",
					"hono",
					"hono/bearer-auth",
					"hono/http-exception",
				],
			},
		},
	},
});

export default defineConfig({
	target: "cloudflare",
});
