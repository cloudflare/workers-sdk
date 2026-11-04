import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@cloudflare/workers-utils/oidc": fileURLToPath(
				new URL("../workers-utils/src/oidc.ts", import.meta.url)
			),
		},
	},
	test: {
		include: ["**/__tests__/**/*.test.ts"],
		reporters: ["default"],
	},
});
