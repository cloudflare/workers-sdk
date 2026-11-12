import { beforeEach, describe, it, vi } from "vitest";
import { initDeployHelpersContext } from "../src/shared/context";
import { triggersDeploy } from "../src/triggers/deploy";
import type { Config } from "@cloudflare/workers-utils";

const nonInteractive = vi.hoisted(() => ({ value: true }));

vi.mock("@cloudflare/workers-utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/workers-utils")>()),
	isNonInteractiveOrCI: () => nonInteractive.value,
}));

const ACCOUNT_ID = "some-account-id";
const WORKER_NAME = "target-worker";
const OTHER_WORKER_NAME = "other-worker";
const WORKFLOW_NAME = "shared-workflow";
const TEST_TRIGGER_GUIDANCE = {
	queueCreateCommand: (queueName: string) =>
		`test-cli queue create ${queueName}`,
	workersDevConfigFieldName: "workersDev",
	workersDevConfigAssignment: (value: boolean) => `workersDev: ${value}`,
	previewUrlsConfigFieldName: "previewUrls",
	previewUrlsConfigAssignment: (value: boolean) => `previewUrls: ${value}`,
};

// Issue #16858: the standalone trigger deploy (`validated: false`) reassigns a
// Workflow that belongs to another Worker without the ownership check that the
// upload preflight (`checkWorkflowConflicts()`) applies.
describe("triggersDeploy Workflow ownership preflight", () => {
	let requests: string[];
	let warnings: string[];
	const confirm = vi.fn();

	beforeEach(() => {
		nonInteractive.value = true;
		requests = [];
		warnings = [];
		confirm.mockReset();

		initDeployHelpersContext({
			logger: {
				debug() {},
				info() {},
				warn(...args: unknown[]) {
					warnings.push(args.join(" "));
				},
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
				if (path.endsWith(`/workers/workers/${WORKER_NAME}`)) {
					return {
						subdomain: { enabled: false, previews_enabled: false },
					};
				}
				if (path.endsWith(`/workers/scripts/${WORKER_NAME}/subdomain`)) {
					return { enabled: false, previews_enabled: false };
				}
				if (path.endsWith("/workers/subdomain")) {
					return { subdomain: "example-subdomain" };
				}
				if (path.endsWith(`/workflows/${WORKFLOW_NAME}`)) {
					if (method === "GET") {
						return {
							name: WORKFLOW_NAME,
							id: "workflow-id",
							created_on: "2026-01-01T00:00:00Z",
							modified_on: "2026-01-01T00:00:00Z",
							script_name: OTHER_WORKER_NAME,
							class_name: "OldClass",
						};
					}
					return {};
				}
				if (path.endsWith(`/workers/services/${WORKER_NAME}`)) {
					return { default_environment: { script: { tag: "tag" } } };
				}
				if (
					init?.method === "POST" &&
					path.endsWith("/email/routing/rules/plan")
				) {
					return { zones: [] };
				}
				throw new Error(`Unexpected request: ${method} ${path}`);
			}) as never,
			fetchListResult: (() => []) as never,
			fetchPagedListResult: (async () => []) as never,
			fetchKVGetValue: (() => {}) as never,
			confirm: confirm as never,
			prompt: (() => {}) as never,
			select: (() => {}) as never,
		});
	});

	function config(): Config {
		return {
			workers_dev: false,
			preview_urls: false,
			queues: { producers: [], consumers: [] },
			workflows: [{ name: WORKFLOW_NAME, class_name: "NewClass" }],
		} as unknown as Config;
	}

	function deployTriggers() {
		return triggersDeploy({
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
	}

	it("warns before reassigning a Workflow that belongs to another Worker", async ({
		expect,
	}) => {
		await deployTriggers();

		const workflowRequests = requests.filter((request) =>
			request.endsWith(`/accounts/${ACCOUNT_ID}/workflows/${WORKFLOW_NAME}`)
		);
		expect(workflowRequests).toEqual([
			`GET /accounts/${ACCOUNT_ID}/workflows/${WORKFLOW_NAME}`,
			`PUT /accounts/${ACCOUNT_ID}/workflows/${WORKFLOW_NAME}`,
		]);
		expect(warnings.join("\n")).toContain(
			`"${WORKFLOW_NAME}" (currently belongs to "${OTHER_WORKER_NAME}")`
		);
	});

	it("does not reassign a Workflow that belongs to another Worker when the user declines", async ({
		expect,
	}) => {
		nonInteractive.value = false;
		confirm.mockResolvedValue(false);

		await deployTriggers().catch(() => {});

		expect(confirm).toHaveBeenCalled();
		expect(requests).not.toContain(
			`PUT /accounts/${ACCOUNT_ID}/workflows/${WORKFLOW_NAME}`
		);
	});
});
