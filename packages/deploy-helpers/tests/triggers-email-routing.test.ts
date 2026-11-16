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
const TEST_TRIGGER_GUIDANCE = {
	queueCreateCommand: (queueName: string) =>
		`test-cli queue create ${queueName}`,
	workersDevConfigFieldName: "workersDev",
	workersDevConfigAssignment: (value: boolean) => `workersDev: ${value}`,
	previewUrlsConfigFieldName: "previewUrls",
	previewUrlsConfigAssignment: (value: boolean) => `previewUrls: ${value}`,
};

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
				if (path.endsWith(`/workers/workers/${WORKER_NAME}`)) {
					return {
						subdomain: { enabled: false, previews_enabled: false },
					};
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
			...TEST_TRIGGER_GUIDANCE,
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
			...TEST_TRIGGER_GUIDANCE,
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
				...TEST_TRIGGER_GUIDANCE,
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
				...TEST_TRIGGER_GUIDANCE,
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
	let fetchListRequests: string[];
	let fetchPagedListRequests: string[];
	let logs: string[];

	beforeEach(() => {
		fetchResultRequests = [];
		fetchListRequests = [];
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
				if (path.endsWith(`/workers/workers/${WORKER_NAME}`)) {
					return {
						subdomain: { enabled: false, previews_enabled: false },
					};
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
			fetchListResult: (async (_config: Config, path: string) => {
				fetchListRequests.push(path);
				return [];
			}) as never,
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

	it("dry-run lists configured trigger targets without API calls", async ({
		expect,
	}) => {
		await triggersDeploy({
			...TEST_TRIGGER_GUIDANCE,
			config: baseConfig({
				queues: {
					producers: [
						{ binding: "QUEUE", queue: "producer-queue" },
						{ binding: "UNNAMED_QUEUE" },
					],
					consumers: [{ queue: "consumer-queue" }],
				},
				workflows: [
					{ binding: "WORKFLOW", name: "workflow", class_name: "Workflow" },
					{
						binding: "SAME_WORKER",
						name: "same-worker-workflow",
						class_name: "SameWorkerWorkflow",
						script_name: WORKER_NAME,
					},
					{
						binding: "EXTERNAL_WORKFLOW",
						name: "external-workflow",
						class_name: "ExternalWorkflow",
						script_name: "other-worker",
					},
				],
				exports: {
					Workflow: { type: "workflow", name: "workflow" },
					ExportedWorkflow: { type: "workflow", name: "exported-workflow" },
				},
				triggers: {
					events: [
						{
							type: "cf.artifacts.repo.pushed",
							targets: [{ type: "workflow", workflow_name: "workflow" }],
						},
					],
				},
			}),
			scriptName: WORKER_NAME,
			crons: ["0 * * * *"],
			routes: [
				"example.com/*",
				{ pattern: "api.example.com/*", zone_name: "example.com" },
				{ pattern: "custom.example.com", custom_domain: true },
			],
			firstDeploy: false,
			dryRun: true,
			accountId: undefined,
			validated: false,
		});

		expect(logs).toEqual([
			"--dry-run: no changes will be made. Would deploy test-name triggers:",
			"  example.com/*",
			"  api.example.com/* (zone name: example.com)",
			"  custom.example.com (custom domain)",
			"  schedule: 0 * * * *",
			"  Producer for producer-queue",
			"  Producer for UNNAMED_QUEUE",
			"  Consumer for consumer-queue",
			"  workflow: workflow",
			"  workflow: same-worker-workflow",
			"  workflow: exported-workflow",
			"  event triggers: 1",
		]);
		expect(fetchResultRequests).toEqual([]);
		expect(fetchListRequests).toEqual([]);
		expect(fetchPagedListRequests).toEqual([]);
	});

	it.for([
		{ workersDev: undefined, routes: [], enabled: true },
		{ workersDev: undefined, routes: ["example.com/*"], enabled: false },
		{ workersDev: true, routes: ["example.com/*"], enabled: true },
		{ workersDev: false, routes: [], enabled: false },
	])(
		"dry-run respects workers_dev=$workersDev with routes=$routes",
		async ({ workersDev, routes, enabled }, { expect }) => {
			await triggersDeploy({
				...TEST_TRIGGER_GUIDANCE,
				config: baseConfig({ workers_dev: workersDev }),
				scriptName: WORKER_NAME,
				crons: undefined,
				routes,
				firstDeploy: false,
				dryRun: true,
				accountId: undefined,
				validated: false,
			});

			expect(logs).toEqual([
				enabled || routes.length > 0
					? "--dry-run: no changes will be made. Would deploy test-name triggers:"
					: "--dry-run: no changes will be made. No targets to deploy for test-name.",
				...(enabled ? ["  workers.dev (enabled)"] : []),
				...routes.map((route) => `  ${route}`),
			]);
			expect(fetchResultRequests).toEqual([]);
			expect(fetchListRequests).toEqual([]);
			expect(fetchPagedListRequests).toEqual([]);
		}
	);

	it("dry-run includes explicitly empty event triggers", async ({ expect }) => {
		await triggersDeploy({
			...TEST_TRIGGER_GUIDANCE,
			config: baseConfig({ triggers: { events: [] } }),
			scriptName: WORKER_NAME,
			crons: [],
			routes: [],
			firstDeploy: false,
			dryRun: true,
			accountId: undefined,
			validated: false,
		});

		expect(logs).toEqual([
			"--dry-run: no changes will be made. Would deploy test-name triggers:",
			"  event triggers: 0",
		]);
		expect(fetchResultRequests).toEqual([]);
		expect(fetchListRequests).toEqual([]);
		expect(fetchPagedListRequests).toEqual([]);
	});

	it("dry-run validates event trigger targets without API calls", async ({
		expect,
	}) => {
		await triggersDeploy({
			...TEST_TRIGGER_GUIDANCE,
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

		expect(logs).toContain(
			"--dry-run: no changes will be made. Would deploy test-name triggers:"
		);
		expect(fetchResultRequests).toEqual([]);
		expect(fetchPagedListRequests).toEqual([]);
	});

	it("dry-run fails invalid event trigger targets before API calls", async ({
		expect,
	}) => {
		await expect(
			triggersDeploy({
				...TEST_TRIGGER_GUIDANCE,
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
				...TEST_TRIGGER_GUIDANCE,
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
			...TEST_TRIGGER_GUIDANCE,
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
			`GET /accounts/${ACCOUNT_ID}/workers/workers/${WORKER_NAME}`,
			`POST /accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/subdomain`,
		]);
	});
});
