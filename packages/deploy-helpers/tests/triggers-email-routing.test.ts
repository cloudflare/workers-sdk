import { beforeEach, describe, it, vi } from "vitest";
import { initDeployHelpersContext } from "../src/shared/context";
import { triggersDeploy } from "../src/triggers/deploy";
import type { Config } from "@cloudflare/workers-utils";

vi.mock("@cloudflare/workers-utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/workers-utils")>()),
	isNonInteractiveOrCI: () => true,
}));

const ACCOUNT_ID = "some-account-id";
const WORKER_NAME = "test-name";
const WORKER_TAG = "a7e6fb77503c41d8a7f3113c6918f10c";

describe("triggersDeploy Email Routing integration", () => {
	let metadataRequests: number;
	let planRequests: number;

	beforeEach(() => {
		metadataRequests = 0;
		planRequests = 0;

		initDeployHelpersContext({
			logger: {
				debug() {},
				info() {},
				warn() {},
				log() {},
				error() {},
			},
			fetchResult: (async (
				_config: Config,
				path: string,
				init?: RequestInit
			) => {
				if (path.endsWith("/subdomain")) {
					return { enabled: false, previews_enabled: false };
				}
				if (path.endsWith(`/workers/services/${WORKER_NAME}`)) {
					metadataRequests++;
					return { default_environment: { script: { tag: WORKER_TAG } } };
				}
				if (path.endsWith("/schedules")) {
					throw new Error("trigger deployment failed");
				}
				if (
					init?.method === "POST" &&
					path.endsWith("/email/routing/rules/plan")
				) {
					planRequests++;
					return { zones: [] };
				}
				throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${path}`);
			}) as never,
			fetchListResult: (() => {}) as never,
			fetchPagedListResult: (() => {}) as never,
			fetchKVGetValue: (() => {}) as never,
			confirm: (() => {}) as never,
			prompt: (() => {}) as never,
			select: (() => {}) as never,
		});
	});

	function config(): Config {
		return {
			addresses: ["support@example.com"],
			workers_dev: false,
			preview_urls: false,
			queues: { producers: [], consumers: [] },
			workflows: [],
		} as unknown as Config;
	}

	it("reconciles once with the tag supplied by normal deploy", async ({
		expect,
	}) => {
		await triggersDeploy({
			config: config(),
			accountId: ACCOUNT_ID,
			scriptName: WORKER_NAME,
			workerTag: WORKER_TAG,
			env: undefined,
			crons: undefined,
			routes: [],
			firstDeploy: false,
		});

		expect(planRequests).toBe(1);
		expect(metadataRequests).toBe(0);
	});

	it("reconciles once and resolves the tag for standalone trigger deploy", async ({
		expect,
	}) => {
		await triggersDeploy({
			config: config(),
			accountId: ACCOUNT_ID,
			scriptName: WORKER_NAME,
			env: undefined,
			crons: undefined,
			routes: [],
			firstDeploy: false,
		});

		expect(planRequests).toBe(1);
		expect(metadataRequests).toBe(1);
	});

	it("reconciles when another trigger deployment fails", async ({ expect }) => {
		await expect(
			triggersDeploy({
				config: config(),
				accountId: ACCOUNT_ID,
				scriptName: WORKER_NAME,
				workerTag: WORKER_TAG,
				env: undefined,
				crons: ["* * * * *"],
				routes: [],
				firstDeploy: false,
			})
		).rejects.toThrow("trigger deployment failed");

		expect(planRequests).toBe(1);
	});
});
