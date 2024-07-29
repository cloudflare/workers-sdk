import path from "node:path";
import {
	buildPagesASSETSBinding,
	defineWorkersProject,
} from "@cloudflare/vitest-pool-workers/config";

const assetsPath = path.join(__dirname, "public");

export default defineWorkersProject(async () => ({
	test: {
		globalSetup: ["./global-setup.ts"], // Only required for integration tests
		poolOptions: {
			workers: {
				main: "./dist-functions/index.js", // Built by `global-setup.ts`
				singleWorker: true,
				miniflare: {
					compatibilityFlags: ["nodejs_compat"],
					compatibilityDate: "2024-01-01",
					kvNamespaces: ["KV_NAMESPACE"],
					serviceBindings: {
						ASSETS: await buildPagesASSETSBinding(assetsPath),
					},
				},
			},
		},
	},
}));
