import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

const DEVPROD_TESTING_ACCOUNT_ID = "8d783f274e1f82dc46744c297b015a2f";
const isDevProdTestingAccount =
	process.env.CLOUDFLARE_ACCOUNT_ID === DEVPROD_TESTING_ACCOUNT_ID;

export default defineConfig({
	plugins: [
		cloudflare({
			persistState: false,
			configPath: "wrangler.jsonc",
			auxiliaryWorkers: [
				{ configPath: "wrangler.docker.jsonc" },
				...(isDevProdTestingAccount
					? [{ configPath: "wrangler.registry.jsonc" }]
					: []),
			],
		}),
	],
});
