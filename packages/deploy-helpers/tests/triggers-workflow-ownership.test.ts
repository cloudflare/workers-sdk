import { beforeEach, describe, it } from "vitest";
import { initDeployHelpersContext } from "../src/shared/context";
import { triggersDeploy } from "../src/triggers/deploy";
import type { Config } from "@cloudflare/workers-utils/config";

const ACCOUNT_ID = "some-account-id";
const WORKER_NAME = "target-worker";
const WORKFLOW_NAME = "shared-workflow";

const TEST_TRIGGER_GUIDANCE = {
	queueCreateCommand: (queueName: string) =>
		`test-cli queue create ${queueName}`,
	workersDevConfigFieldName: "workersDev",
	workersDevConfigAssignment: (value: boolean) => `workersDev: ${value}`,
	previewUrlsConfigFieldName: "previewUrls",
	previewUrlsConfigAssignment: (value: boolean) => `previewUrls: ${value}`,
};

describe("triggersDeploy Workflow ownership", () => {
	let requests: string[];

	beforeEach(() => {
		requests = [];

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
				const method = init?.method ?? "GET";
				requests.push(`${method} ${path}`);
				if (path === `/accounts/${ACCOUNT_ID}/workflows/${WORKFLOW_NAME}`) {
					return method === "GET"
						? {
								name: WORKFLOW_NAME,
								script_name: "other-worker",
								class_name: "OldClass",
							}
						: {};
				}
				if (path.endsWith("/workers/subdomain")) {
					return { subdomain: "example-subdomain" };
				}
				if (path.endsWith(`/workers/workers/${WORKER_NAME}`)) {
					return { subdomain: { enabled: false, previews_enabled: false } };
				}
				if (path.endsWith("/subdomain")) {
					return { enabled: false, previews_enabled: false };
				}
				throw new Error(`Unexpected request: ${method} ${path}`);
			}) as never,
			fetchListResult: (async () => []) as never,
			fetchPagedListResult: (async () => []) as never,
			fetchKVGetValue: (() => {}) as never,
			confirm: (async () => true) as never,
			prompt: (() => {}) as never,
			select: (() => {}) as never,
		});
	});

	it("checks a Workflow's current owner before reassigning it", async ({
		expect,
	}) => {
		const config = {
			workers_dev: false,
			preview_urls: false,
			queues: { producers: [], consumers: [] },
			workflows: [
				{
					binding: "WORKFLOW",
					name: WORKFLOW_NAME,
					class_name: "NewClass",
				},
			],
		} as unknown as Config;

		// A fix may warn and continue, or refuse to reassign; either is fine as
		// long as the current owner is checked first.
		await triggersDeploy({
			...TEST_TRIGGER_GUIDANCE,
			config,
			accountId: ACCOUNT_ID,
			scriptName: WORKER_NAME,
			crons: undefined,
			routes: [],
			firstDeploy: false,
			dryRun: false,
			validated: false,
		}).catch(() => undefined);

		const ownershipCheck = requests.indexOf(
			`GET /accounts/${ACCOUNT_ID}/workflows/${WORKFLOW_NAME}`
		);
		const reassignment = requests.findIndex((request) =>
			request.startsWith(
				`PUT /accounts/${ACCOUNT_ID}/workflows/${WORKFLOW_NAME}`
			)
		);

		expect(ownershipCheck).toBeGreaterThan(-1);
		if (reassignment !== -1) {
			expect(ownershipCheck).toBeLessThan(reassignment);
		}
	});
});
