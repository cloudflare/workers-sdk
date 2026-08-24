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
	let planError: Error | undefined;

	beforeEach(() => {
		metadataRequests = 0;
		planRequests = 0;
		planError = undefined;

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
					if (planError !== undefined) {
						throw planError;
					}
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
			crons: undefined,
			routes: [],
			firstDeploy: false,
			dryRun: false,
			validated: false,
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
			crons: undefined,
			routes: [],
			firstDeploy: false,
			dryRun: false,
			validated: false,
		});

		expect(planRequests).toBe(1);
		expect(metadataRequests).toBe(1);
	});

	it("rethrows an email routing failure when no other trigger failed", async ({
		expect,
	}) => {
		planError = new Error("email routing failed");

		await expect(
			triggersDeploy({
				config: config(),
				accountId: ACCOUNT_ID,
				scriptName: WORKER_NAME,
				workerTag: WORKER_TAG,
				crons: undefined,
				routes: [],
				firstDeploy: false,
				dryRun: false,
				validated: false,
			})
		).rejects.toBe(planError);
	});

	it("reconciles when another trigger deployment fails", async ({ expect }) => {
		await expect(
			triggersDeploy({
				config: config(),
				accountId: ACCOUNT_ID,
				scriptName: WORKER_NAME,
				workerTag: WORKER_TAG,
				crons: ["* * * * *"],
				routes: [],
				firstDeploy: false,
				dryRun: false,
				validated: false,
			})
		).rejects.toThrow("trigger deployment failed");

		expect(planRequests).toBe(1);
	});
});

describe("triggersDeploy preflight", () => {
	let fetchResultRequests: string[];
	let fetchPagedListRequests: string[];
	let logs: string[];

	beforeEach(() => {
		fetchResultRequests = [];
		fetchPagedListRequests = [];
		logs = [];

		initDeployHelpersContext({
			logger: {
				debug() {},
				info() {},
				warn() {},
				log(...args: unknown[]) {
					logs.push(args.join(" "));
				},
				error() {},
			},
			fetchResult: (async (
				_config: Config,
				path: string,
				init?: RequestInit
			) => {
				fetchResultRequests.push(`${init?.method ?? "GET"} ${path}`);
				if (path.endsWith("/subdomain")) {
					return { enabled: false, previews_enabled: false };
				}
				if (path.endsWith(`/workers/services/${WORKER_NAME}`)) {
					return { default_environment: { script: { tag: WORKER_TAG } } };
				}
				if (
					init?.method === "POST" &&
					path.endsWith("/email/routing/rules/plan")
				) {
					return { zones: [] };
				}
				throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${path}`);
			}) as never,
			fetchListResult: (() => []) as never,
			fetchPagedListResult: (async (_config: Config, path: string) => {
				fetchPagedListRequests.push(path);
				return [];
			}) as never,
			fetchKVGetValue: (() => {}) as never,
			confirm: (() => {}) as never,
			prompt: (() => {}) as never,
			select: (() => {}) as never,
		});
	});

	function baseConfig(overrides: Partial<Config> = {}): Config {
		return {
			workers_dev: false,
			preview_urls: false,
			queues: { producers: [], consumers: [] },
			workflows: [],
			...overrides,
		} as unknown as Config;
	}

	it("dry-run validates event trigger targets without API calls", async ({
		expect,
	}) => {
		await triggersDeploy({
			config: baseConfig({
				workflows: [{ name: "workflow", class_name: "Workflow" }],
				triggers: {
					events: [
						{
							type: "send_email",
							targets: [{ workflow_name: "workflow" }],
						},
					],
				},
			} as unknown as Partial<Config>),
			scriptName: WORKER_NAME,
			crons: undefined,
			routes: [],
			firstDeploy: false,
			dryRun: true,
			accountId: undefined,
			validated: false,
		});

		expect(logs).toContain("--dry-run: exiting now.");
		expect(fetchResultRequests).toEqual([]);
		expect(fetchPagedListRequests).toEqual([]);
	});

	it("dry-run fails invalid event trigger targets before API calls", async ({
		expect,
	}) => {
		await expect(
			triggersDeploy({
				config: baseConfig({
					triggers: {
						events: [
							{
								type: "send_email",
								targets: [{ workflow_name: "missing-workflow" }],
							},
						],
					},
				} as unknown as Partial<Config>),
				scriptName: WORKER_NAME,
				crons: undefined,
				routes: [],
				firstDeploy: false,
				dryRun: true,
				accountId: undefined,
				validated: false,
			})
		).rejects.toThrow(
			'Event trigger "send_email" targets Workflow "missing-workflow"'
		);

		expect(fetchResultRequests).toEqual([]);
		expect(fetchPagedListRequests).toEqual([]);
	});

	it("runs queue preflight before standalone trigger deployment", async ({
		expect,
	}) => {
		await expect(
			triggersDeploy({
				config: baseConfig({
					queues: {
						producers: [{ binding: "QUEUE", queue: "missing-queue" }],
						consumers: [],
					},
				} as unknown as Partial<Config>),
				accountId: ACCOUNT_ID,
				scriptName: WORKER_NAME,
				crons: undefined,
				routes: [],
				firstDeploy: false,
				validated: false,
				dryRun: false,
			})
		).rejects.toThrow('Queue "missing-queue" does not exist');

		expect(fetchPagedListRequests).toEqual([`/accounts/${ACCOUNT_ID}/queues`]);
		expect(fetchResultRequests).toEqual([]);
	});

	it("skips queue preflight when already validated", async ({ expect }) => {
		await triggersDeploy({
			config: baseConfig({
				queues: {
					producers: [{ binding: "QUEUE", queue: "missing-queue" }],
					consumers: [],
				},
			} as unknown as Partial<Config>),
			accountId: ACCOUNT_ID,
			scriptName: WORKER_NAME,
			crons: undefined,
			routes: [],
			firstDeploy: false,
			validated: true,
			dryRun: false,
		});

		expect(fetchPagedListRequests).toEqual([]);
		expect(fetchResultRequests).toEqual([
			`GET /accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/subdomain`,
			`POST /accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/subdomain`,
		]);
	});
});
