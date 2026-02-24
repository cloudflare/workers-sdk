/* eslint-disable workers-sdk/no-vitest-import-expect */

import * as fs from "node:fs";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getInstalledPackageVersion } from "../../autoconfig/frameworks/utils/packages";
import { WORKFLOW_NOT_FOUND_CODE } from "../../deploy/check-workflow-conflicts";
import { clearOutputFilePath } from "../../output";
import { fetchSecrets } from "../../utils/fetch-secrets";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import { mockSubDomainRequest } from "../helpers/mock-workers-subdomain";
import { createFetchResult, msw } from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import {
	mockDeploymentsListRequest,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
} from "./helpers";

vi.mock("command-exists");
vi.mock("../../check/commands", async (importOriginal) => {
	return {
		...(await importOriginal()),
		analyseBundle() {
			return `{}`;
		},
	};
});

vi.mock("../../utils/fetch-secrets");

vi.mock("../../package-manager", async (importOriginal) => ({
	...(await importOriginal()),
	sniffUserAgent: () => "npm",
	getPackageManager() {
		return {
			type: "npm",
			npx: "npx",
		};
	},
}));

vi.mock("../../autoconfig/run");
vi.mock("../../autoconfig/frameworks/utils/packages");
vi.mock("../../autoconfig/c3-vendor/command");

describe("deploy", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		vi.stubGlobal("setTimeout", (fn: () => void) => {
			setImmediate(fn);
		});
		setIsTTY(true);
		mockLastDeploymentRequest();
		mockDeploymentsListRequest();
		mockPatchScriptSettings();
		mockGetSettings();
		msw.use(...mswListNewDeploymentsLatestFull);
		// Pretend all R2 buckets exist for the purposes of deployment testing.
		// Otherwise, wrangler deploy would try to provision them. The provisioning
		// behaviour is tested in provision.test.ts
		msw.use(
			http.get("*/accounts/:accountId/r2/buckets/:bucketName", async () => {
				return HttpResponse.json(createFetchResult({}));
			})
		);
		vi.mocked(fetchSecrets).mockResolvedValue([]);
		vi.mocked(getInstalledPackageVersion).mockReturnValue(undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearDialogs();
		clearOutputFilePath();
	});

	describe("workflows", () => {
		function mockDeployWorkflow(expectedWorkflowName?: string) {
			const handler = http.put(
				"*/accounts/:accountId/workflows/:workflowName",
				({ params }) => {
					if (expectedWorkflowName) {
						expect(params.workflowName).toBe(expectedWorkflowName);
					}
					return HttpResponse.json(
						createFetchResult({ id: "mock-new-workflow-id" })
					);
				}
			);
			msw.use(handler);
		}

		beforeEach(() => {
			msw.use(
				http.get("*/accounts/:accountId/workflows/:workflowName", () => {
					return HttpResponse.json(
						{
							success: false,
							errors: [{ code: 10200, message: "Workflow not found" }],
							messages: [],
							result: null,
						},
						{ status: 404 }
					);
				})
			);
		});

		it("should deploy a workflow", async () => {
			writeWranglerConfig({
				main: "index.js",
				workflows: [
					{
						binding: "WORKFLOW",
						name: "my-workflow",
						class_name: "MyWorkflow",
					},
				],
			});
			await fs.promises.writeFile(
				"index.js",
				`
                import { WorkflowEntrypoint } from 'cloudflare:workers';
                export default {};
                export class MyWorkflow extends WorkflowEntrypoint {};
            `
			);

			mockDeployWorkflow("my-workflow");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "workflow",
						name: "WORKFLOW",
						workflow_name: "my-workflow",
						class_name: "MyWorkflow",
					},
				],
			});

			await runWrangler("deploy");

			expect(std.warn).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                        Resource
				env.WORKFLOW (MyWorkflow)      Workflow

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  workflow: my-workflow
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should not call Workflow's API if the workflow binds to another script", async () => {
			writeWranglerConfig({
				main: "index.js",
				name: "this-script",
				workflows: [
					{
						binding: "WORKFLOW",
						name: "my-workflow",
						class_name: "MyWorkflow",
						script_name: "another-script",
					},
				],
			});

			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedScriptName: "this-script",
				expectedBindings: [
					{
						type: "workflow",
						name: "WORKFLOW",
						workflow_name: "my-workflow",
						class_name: "MyWorkflow",
						script_name: "another-script",
					},
				],
			});

			const handler = http.put(
				"*/accounts/:accountId/workflows/:workflowName",
				() => {
					expect(
						false,
						"Workflows API should not be called at all, in this case."
					);
				}
			);
			msw.use(handler);
			await fs.promises.writeFile(
				"index.js",
				`
                export default {};
            `
			);

			await runWrangler("deploy");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                                                    Resource
				env.WORKFLOW (MyWorkflow (defined in another-script))      Workflow

				Uploaded this-script (TIMINGS)
				Deployed this-script triggers (TIMINGS)
				  https://this-script.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});

		describe("workflow conflict detection", () => {
			function mockGetWorkflow(
				workflowsByName: Record<
					string,
					{
						id: string;
						name: string;
						script_name: string;
						class_name: string;
						created_on: string;
						modified_on: string;
					} | null
				>
			) {
				msw.use(
					http.get(
						"*/accounts/:accountId/workflows/:workflowName",
						({ params }) => {
							const workflow = workflowsByName[params.workflowName as string];
							if (workflow === null || workflow === undefined) {
								return HttpResponse.json(
									{
										success: false,
										errors: [
											{ code: WORKFLOW_NOT_FOUND_CODE, message: "Not found" },
										],
										messages: [],
										result: null,
									},
									{ status: 404 }
								);
							}
							return HttpResponse.json({
								success: true,
								errors: [],
								messages: [],
								result: workflow,
							});
						}
					)
				);
			}

			it("should warn when deploying a workflow that belongs to a different worker", async () => {
				writeWranglerConfig({
					main: "index.js",
					workflows: [
						{
							binding: "WORKFLOW",
							name: "my-workflow",
							class_name: "MyWorkflow",
						},
					],
				});
				await fs.promises.writeFile(
					"index.js",
					`
					import { WorkflowEntrypoint } from 'cloudflare:workers';
					export default {};
					export class MyWorkflow extends WorkflowEntrypoint {};
				`
				);

				mockGetWorkflow({
					"my-workflow": {
						id: "existing-workflow-id",
						name: "my-workflow",
						script_name: "other-worker",
						class_name: "SomeClass",
						created_on: "2024-01-01T00:00:00Z",
						modified_on: "2024-01-01T00:00:00Z",
					},
				});

				mockSubDomainRequest();
				mockUploadWorkerRequest();
				mockDeployWorkflow("my-workflow");

				mockConfirm({
					text: "Do you want to continue?",
					result: true,
				});

				await runWrangler("deploy");

				expect(std.warn).toContain(
					"already exist and belong to different workers"
				);
				expect(std.warn).toContain(
					'"my-workflow" (currently belongs to "other-worker")'
				);
				expect(std.warn).toContain(
					'Deploying will reassign these workflows to "test-name".'
				);
			});

			it("should abort deploy when user declines the workflow conflict confirmation", async () => {
				writeWranglerConfig({
					main: "index.js",
					workflows: [
						{
							binding: "WORKFLOW",
							name: "my-workflow",
							class_name: "MyWorkflow",
						},
					],
				});
				await fs.promises.writeFile(
					"index.js",
					`
					import { WorkflowEntrypoint } from 'cloudflare:workers';
					export default {};
					export class MyWorkflow extends WorkflowEntrypoint {};
				`
				);

				mockGetWorkflow({
					"my-workflow": {
						id: "existing-workflow-id",
						name: "my-workflow",
						script_name: "other-worker",
						class_name: "SomeClass",
						created_on: "2024-01-01T00:00:00Z",
						modified_on: "2024-01-01T00:00:00Z",
					},
				});

				mockConfirm({
					text: "Do you want to continue?",
					result: false,
				});

				await runWrangler("deploy");

				expect(std.warn).toContain(
					"already exist and belong to different workers"
				);
				expect(std.out).not.toContain("Uploaded");
			});

			it("should not warn when workflow belongs to the same worker", async () => {
				writeWranglerConfig({
					main: "index.js",
					workflows: [
						{
							binding: "WORKFLOW",
							name: "my-workflow",
							class_name: "MyWorkflow",
						},
					],
				});
				await fs.promises.writeFile(
					"index.js",
					`
					import { WorkflowEntrypoint } from 'cloudflare:workers';
					export default {};
					export class MyWorkflow extends WorkflowEntrypoint {};
				`
				);

				mockGetWorkflow({
					"my-workflow": {
						id: "existing-workflow-id",
						name: "my-workflow",
						script_name: "test-name",
						class_name: "MyWorkflow",
						created_on: "2024-01-01T00:00:00Z",
						modified_on: "2024-01-01T00:00:00Z",
					},
				});

				mockSubDomainRequest();
				mockUploadWorkerRequest();
				mockDeployWorkflow("my-workflow");

				await runWrangler("deploy");

				expect(std.warn).not.toContain(
					"already exist and belong to different workers"
				);
				expect(std.out).toContain("Uploaded test-name");
			});

			it("should not warn when workflow does not exist yet", async () => {
				writeWranglerConfig({
					main: "index.js",
					workflows: [
						{
							binding: "WORKFLOW",
							name: "my-workflow",
							class_name: "MyWorkflow",
						},
					],
				});
				await fs.promises.writeFile(
					"index.js",
					`
					import { WorkflowEntrypoint } from 'cloudflare:workers';
					export default {};
					export class MyWorkflow extends WorkflowEntrypoint {};
				`
				);

				mockGetWorkflow({
					"my-workflow": null,
				});

				mockSubDomainRequest();
				mockUploadWorkerRequest();
				mockDeployWorkflow("my-workflow");

				await runWrangler("deploy");

				expect(std.warn).not.toContain(
					"already exist and belong to different workers"
				);
				expect(std.out).toContain("Uploaded test-name");
			});

			it("should warn about multiple conflicting workflows", async () => {
				writeWranglerConfig({
					main: "index.js",
					workflows: [
						{
							binding: "WORKFLOW1",
							name: "workflow-one",
							class_name: "WorkflowOne",
						},
						{
							binding: "WORKFLOW2",
							name: "workflow-two",
							class_name: "WorkflowTwo",
						},
					],
				});
				await fs.promises.writeFile(
					"index.js",
					`
					import { WorkflowEntrypoint } from 'cloudflare:workers';
					export default {};
					export class WorkflowOne extends WorkflowEntrypoint {};
					export class WorkflowTwo extends WorkflowEntrypoint {};
				`
				);

				mockGetWorkflow({
					"workflow-one": {
						id: "existing-workflow-1",
						name: "workflow-one",
						script_name: "other-worker-a",
						class_name: "SomeClass",
						created_on: "2024-01-01T00:00:00Z",
						modified_on: "2024-01-01T00:00:00Z",
					},
					"workflow-two": {
						id: "existing-workflow-2",
						name: "workflow-two",
						script_name: "other-worker-b",
						class_name: "AnotherClass",
						created_on: "2024-01-01T00:00:00Z",
						modified_on: "2024-01-01T00:00:00Z",
					},
				});

				mockSubDomainRequest();
				mockUploadWorkerRequest();
				mockDeployWorkflow();

				mockConfirm({
					text: "Do you want to continue?",
					result: true,
				});

				await runWrangler("deploy");

				expect(std.warn).toContain(
					'"workflow-one" (currently belongs to "other-worker-a")'
				);
				expect(std.warn).toContain(
					'"workflow-two" (currently belongs to "other-worker-b")'
				);
			});

			it("should skip workflow conflict check in non-interactive mode without --strict", async () => {
				setIsTTY(false);

				writeWranglerConfig({
					main: "index.js",
					workflows: [
						{
							binding: "WORKFLOW",
							name: "my-workflow",
							class_name: "MyWorkflow",
						},
					],
				});
				await fs.promises.writeFile(
					"index.js",
					`
					import { WorkflowEntrypoint } from 'cloudflare:workers';
					export default {};
					export class MyWorkflow extends WorkflowEntrypoint {};
				`
				);

				// Note: we don't mock the workflows API endpoint - if it's called, the test will fail
				mockSubDomainRequest();
				mockUploadWorkerRequest();
				mockDeployWorkflow("my-workflow");

				await runWrangler("deploy");

				// Should deploy without warning (check was skipped)
				expect(std.warn).not.toContain(
					"already exist and belong to different workers"
				);
				expect(std.out).toContain("Uploaded test-name");
			});

			it("should abort deploy in non-interactive strict mode when workflow belongs to different worker", async () => {
				setIsTTY(false);

				writeWranglerConfig({
					main: "index.js",
					workflows: [
						{
							binding: "WORKFLOW",
							name: "my-workflow",
							class_name: "MyWorkflow",
						},
					],
				});
				await fs.promises.writeFile(
					"index.js",
					`
					import { WorkflowEntrypoint } from 'cloudflare:workers';
					export default {};
					export class MyWorkflow extends WorkflowEntrypoint {};
				`
				);

				mockGetWorkflow({
					"my-workflow": {
						id: "existing-workflow-id",
						name: "my-workflow",
						script_name: "other-worker",
						class_name: "SomeClass",
						created_on: "2024-01-01T00:00:00Z",
						modified_on: "2024-01-01T00:00:00Z",
					},
				});

				await runWrangler("deploy --strict");

				expect(std.warn).toContain(
					"already exist and belong to different workers"
				);
				expect(std.err).toContain(
					"Aborting the deployment operation because of conflicts"
				);
				expect(std.out).not.toContain("Uploaded");
				expect(process.exitCode).not.toBe(0);
			});
		});
	});
});
