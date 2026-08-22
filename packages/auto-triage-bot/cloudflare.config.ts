import {
	bindings,
	defineSettings,
	defineWorker,
} from "@cloudflare/vite-plugin/experimental-config";

const workerName = "workers-sdk-auto-triage";

export const settings = defineSettings({
	accountId: "f7f78ebb28c2a224a9a46a3007350b7a",
});

export default defineWorker({
	name: workerName,
	compatibilityDate: "2026-08-05",
	observability: { enabled: true },
	env: {
		AI: bindings.ai({ dev: { remote: true } }),
		SANDBOX: bindings.durableObject({
			worker: workerName,
			exportName: "Sandbox",
		}),
		GITHUB_TOKEN: bindings.secret(),
		GITHUB_WEBHOOK_SECRET: bindings.secret(),
	},
	exports: {
		FlueIssueTriageAgent: { type: "durable-object", storage: "sqlite" },
		Sandbox: {
			type: "durable-object",
			storage: "sqlite",
			container: "Sandbox",
		},
	},
});
