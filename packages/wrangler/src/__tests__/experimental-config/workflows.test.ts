import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import dedent from "ts-dedent";
import { beforeEach, describe, it, vi } from "vitest";
import { mockLastDeploymentRequest } from "../deploy/helpers";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import { mockSubDomainRequest } from "../helpers/mock-workers-subdomain";
import { createFetchResult, msw } from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
import { runWrangler } from "../helpers/run-wrangler";

vi.mock("@cloudflare/config", async (importOriginal) => {
	const { createConfigMock } = await import("../helpers/mock-new-config");
	return createConfigMock(importOriginal);
});

describe("Workflows in cloudflare.config.ts", () => {
	runInTempDir();
	mockAccountId();
	mockApiToken();
	mockConsoleMethods();
	beforeEach(() => {
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/scripts/:scriptName/secrets",
				() => HttpResponse.json(createFetchResult([]))
			),
			http.get("*/accounts/:accountId/workflows/:workflowName", () =>
				HttpResponse.json(
					createFetchResult(null, false, [
						{ code: 10200, message: "Workflow not found" },
					]),
					{ status: 404 }
				)
			)
		);
	});

	it("deploys a Workflow export that the Worker also binds", async ({
		expect,
	}) => {
		await seed({
			"cloudflare.config.ts": dedent`
				export default { worker: {
					name: "test-name",
					entrypoint: "./index.js",
					compatibilityDate: "2025-12-02",
					exports: {
						MyWorkflow: {
							type: "workflow",
							name: "my-workflow",
							limits: { steps: 10 },
							schedules: "0 * * * *",
							defaultRetention: { successRetention: "3 days" },
						},
					},
					env: {
						WORKFLOW: { type: "workflow", name: "my-workflow", worker: "test-name", exportName: "MyWorkflow" },
					},
				} };
			`,
			"index.js": dedent`
				import { WorkflowEntrypoint } from "cloudflare:workers";
				export default {};
				export class MyWorkflow extends WorkflowEntrypoint {}
			`,
		});
		mockGetSettings();
		mockLastDeploymentRequest();
		msw.use(...mswListNewDeploymentsLatestFull);
		mockSubDomainRequest();
		mockUploadWorkerRequest({
			expectedBindings: [
				{
					type: "workflow",
					name: "WORKFLOW",
					workflow_name: "my-workflow",
					class_name: "MyWorkflow",
					script_name: "test-name",
				},
			],
			expectedExports: {
				MyWorkflow: {
					type: "workflow",
					name: "my-workflow",
					limits: { steps: 10 },
					schedules: "0 * * * *",
					default_retention: { success_retention: "3 days" },
				},
			},
			expectedScriptApiDate: "2026-11-09",
		});
		const putBodies: unknown[] = [];
		msw.use(
			http.put(
				"*/accounts/:accountId/workflows/:workflowName",
				async ({ request }) => {
					putBodies.push(await request.json());
					return HttpResponse.json(
						createFetchResult({ id: "mock-new-workflow-id" })
					);
				}
			)
		);

		await runWrangler("deploy --experimental-new-config");

		expect(putBodies).toEqual([
			{
				script_name: "test-name",
				class_name: "MyWorkflow",
				limits: { steps: 10 },
				schedules: [{ cron: "0 * * * *" }],
				default_retention: { success_retention: "3 days" },
			},
		]);
	});
});
