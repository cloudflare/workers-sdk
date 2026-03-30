import fs from "node:fs";
import {
	mockCreateDate,
	mockEndDate,
	mockModifiedDate,
	mockQueuedDate,
	mockStartDate,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
// eslint-disable-next-line no-restricted-imports
import { afterEach, describe, expect, it } from "vitest";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs } from "./helpers/mock-dialogs";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWorkerSource } from "./helpers/write-worker-source";
import type { Instance, Workflow } from "../workflows/types";

describe("wrangler workflows", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	mockAccountId();
	mockApiToken();
	afterEach(() => {
		clearDialogs();
	});

	const mockGetInstances = async (instances: Instance[]) => {
		msw.use(
			http.get(
				`*/accounts/:accountId/workflows/some-workflow/instances`,
				async () => {
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: instances,
					});
				},
				{ once: true }
			)
		);
	};

	const mockChangeStatusRequest = async (expectedInstance: string) => {
		msw.use(
			http.patch(
				`*/accounts/:accountId/workflows/some-workflow/instances/:instanceId/status`,
				async ({ params }) => {
					expect(params.instanceId).toEqual(expectedInstance);
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: {},
					});
				},
				{ once: true }
			)
		);
	};

	const mockSendEventRequest = async (
		expectedInstance: string,
		event: string
	) => {
		msw.use(
			http.post(
				`*/accounts/:accountId/workflows/some-workflow/instances/:instanceId/events/:event`,
				async ({ params }) => {
					expect(params.instanceId).toEqual(expectedInstance);
					expect(params.event).toEqual(event);
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: {},
					});
				},
				{ once: true }
			)
		);
	};

	const mockDeleteWorkflowRequest = async (workflowName: string) => {
		msw.use(
			http.delete(
				`*/accounts/:accountId/workflows/:workflowName`,
				async ({ params }) => {
					expect(params.workflowName).toEqual(workflowName);
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: {},
					});
				},
				{ once: true }
			)
		);
	};

	const mockInstancesTerminateAll = async (
		expectedWorkflow: string,
		responseStatus: "ok" | "already_running",
		queryStatus: string | null = null
	) => {
		msw.use(
			http.put(
				`*/accounts/:accountId/workflows/:workflowName/instances/terminate`,
				async ({ params, request }) => {
					const maybeStatus = new URL(request.url).searchParams.get("status");
					expect(maybeStatus).toStrictEqual(queryStatus);
					expect(params.workflowName).toEqual(expectedWorkflow);
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: {
							status: responseStatus,
						},
					});
				},
				{ once: true }
			)
		);
	};

	describe("help", () => {
		it("should show help when no argument is passed", async () => {
			writeWranglerConfig();

			await runWrangler(`workflows`);
			await endEventLoop();

			expect(std.out).toMatchInlineSnapshot(
				`
				"wrangler workflows

				🔁 Manage Workflows

				COMMANDS
				  wrangler workflows list                     List Workflows associated to account
				  wrangler workflows describe <name>          Describe Workflow resource
				  wrangler workflows delete <name>            Delete workflow - when deleting a workflow, it will also delete it's own instances
				  wrangler workflows trigger <name> [params]  Trigger a workflow, creating a new instance. Can optionally take a JSON string to pass a parameter into the workflow instance
				  wrangler workflows instances                Manage Workflow instances

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]"
			`
			);
		});
	});

	describe("instances help", () => {
		it("should show instance help when no argument is passed", async () => {
			writeWranglerConfig();

			await runWrangler(`workflows instances`);
			await endEventLoop();

			expect(std.out).toMatchInlineSnapshot(`
				"wrangler workflows instances

				Manage Workflow instances

				COMMANDS
				  wrangler workflows instances list <name>             Instance related commands (list, describe, terminate, pause, resume)
				  wrangler workflows instances describe <name> [id]    Describe a workflow instance - see its logs, retries and errors
				  wrangler workflows instances send-event <name> <id>  Send an event to a workflow instance
				  wrangler workflows instances terminate <name> <id>   Terminate a workflow instance
				  wrangler workflows instances restart <name> <id>     Restart a workflow instance
				  wrangler workflows instances pause <name> <id>       Pause a workflow instance
				  wrangler workflows instances resume <name> <id>      Resume a workflow instance

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]"
			`);
		});
	});

	describe("list", () => {
		const mockWorkflows: Workflow[] = [
			{
				class_name: "wf_class_1",
				created_on: mockCreateDate.toISOString(),
				id: "wf_id_1",
				modified_on: mockModifiedDate.toISOString(),
				name: "wf_1",
				script_name: "wf_script_1",
			},
			{
				class_name: "wf_class_2",
				created_on: mockCreateDate.toISOString(),
				id: "wf_id_2",
				modified_on: mockModifiedDate.toISOString(),
				name: "wf_2",
				script_name: "wf_script_2",
			},
		];

		const mockGetWorkflows = async (workflows: Workflow[]) => {
			msw.use(
				http.get(
					`*/accounts/:accountId/workflows`,
					async () => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: workflows,
						});
					},
					{ once: true }
				)
			);
		};

		it("should get the list of workflows", async () => {
			writeWranglerConfig();
			await mockGetWorkflows(mockWorkflows);

			await runWrangler(`workflows list`);
			expect(std.info).toMatchInlineSnapshot(
				`"Showing 2 workflows from page 1:"`
			);
			expect(std.out).toMatchInlineSnapshot(
				`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				┌─┬─┬─┬─┬─┐
				│ Name │ Script name │ Class name │ Created │ Modified │
				├─┼─┼─┼─┼─┤
				│ wf_1 │ wf_script_1 │ wf_class_1 │ [mock-create-date] │ [mock-modified-date] │
				├─┼─┼─┼─┼─┤
				│ wf_2 │ wf_script_2 │ wf_class_2 │ [mock-create-date] │ [mock-modified-date] │
				└─┴─┴─┴─┴─┘"
			`
			);
		});
	});

	describe("instances list", () => {
		const mockInstances: Instance[] = [
			{
				id: "a",
				created_on: mockCreateDate.toISOString(),
				modified_on: mockModifiedDate.toISOString(),
				workflow_id: "b",
				version_id: "c",
				status: "complete",
			},
			{
				id: "b",
				created_on: mockCreateDate.toISOString(),
				modified_on: mockModifiedDate.toISOString(),
				workflow_id: "b",
				version_id: "c",
				status: "errored",
			},
			{
				id: "c",
				created_on: mockCreateDate.toISOString(),
				modified_on: mockModifiedDate.toISOString(),
				workflow_id: "b",
				version_id: "c",
				status: "paused",
			},
			{
				id: "d",
				created_on: mockCreateDate.toISOString(),
				modified_on: mockModifiedDate.toISOString(),
				workflow_id: "b",
				version_id: "c",
				status: "queued",
			},
			{
				id: "d",
				created_on: mockCreateDate.toISOString(),
				modified_on: mockModifiedDate.toISOString(),
				workflow_id: "b",
				version_id: "c",
				status: "running",
			},
			{
				id: "e",
				created_on: mockCreateDate.toISOString(),
				modified_on: mockModifiedDate.toISOString(),
				workflow_id: "b",
				version_id: "c",
				status: "terminated",
			},
			{
				id: "f",
				created_on: mockCreateDate.toISOString(),
				modified_on: mockModifiedDate.toISOString(),
				workflow_id: "b",
				version_id: "c",
				status: "waiting",
			},
			{
				id: "g",
				created_on: mockCreateDate.toISOString(),
				modified_on: mockModifiedDate.toISOString(),
				workflow_id: "b",
				version_id: "c",
				status: "waitingForPause",
			},
		];

		it("should get the list of instances given a name", async () => {
			writeWranglerConfig();
			await mockGetInstances(mockInstances);

			await runWrangler(`workflows instances list some-workflow`);
			expect(std.info).toMatchInlineSnapshot(
				`"Showing 8 instances from page 1:"`
			);
			expect(std.out).toMatchInlineSnapshot(
				`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				┌─┬─┬─┬─┬─┐
				│ Instance ID │ Version │ Created │ Modified │ Status │
				├─┼─┼─┼─┼─┤
				│ a │ c │ [mock-create-date] │ [mock-modified-date] │ ✅ Completed │
				├─┼─┼─┼─┼─┤
				│ b │ c │ [mock-create-date] │ [mock-modified-date] │ ❌ Errored │
				├─┼─┼─┼─┼─┤
				│ c │ c │ [mock-create-date] │ [mock-modified-date] │ ⏸️ Paused │
				├─┼─┼─┼─┼─┤
				│ d │ c │ [mock-create-date] │ [mock-modified-date] │ ⌛ Queued │
				├─┼─┼─┼─┼─┤
				│ d │ c │ [mock-create-date] │ [mock-modified-date] │ ▶ Running │
				├─┼─┼─┼─┼─┤
				│ e │ c │ [mock-create-date] │ [mock-modified-date] │ 🚫 Terminated │
				├─┼─┼─┼─┼─┤
				│ f │ c │ [mock-create-date] │ [mock-modified-date] │ ⏰ Waiting │
				├─┼─┼─┼─┼─┤
				│ g │ c │ [mock-create-date] │ [mock-modified-date] │ ⏱️ Waiting for Pause │
				└─┴─┴─┴─┴─┘"
			`
			);
		});
	});

	describe("instances describe", () => {
		const mockDescribeInstances = async () => {
			const mockResponse = {
				end: mockEndDate.toISOString(),
				output: "string",
				params: {},
				queued: mockQueuedDate.toISOString(),
				start: mockStartDate.toISOString(),
				status: "queued",
				success: true,
				trigger: {
					source: "unknown",
				},
				versionId: "14707576-2549-4848-82ed-f68f8a1b47c7",
				steps: [
					{
						type: "waitForEvent",
						end: mockEndDate.toISOString(),
						name: "event",
						finished: true,
						output: {},
						start: mockStartDate.toISOString(),
					},
					{
						attempts: [
							{
								end: mockEndDate.toISOString(),
								error: {
									message: "string",
									name: "string",
								},
								start: mockStartDate.toISOString(),
								success: true,
							},
						],
						config: {
							retries: {
								backoff: "constant",
								delay: "string",
								limit: 0,
							},
							timeout: "string",
						},
						end: mockEndDate.toISOString(),
						name: "string",
						output: {},
						start: mockStartDate.toISOString(),
						success: true,
						type: "step",
					},
				],
			};

			msw.use(
				http.get(
					`*/accounts/:accountId/workflows/some-workflow/instances/:instanceId`,
					async () => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: mockResponse,
						});
					},
					{ once: true }
				),
				http.get(
					`*/accounts/:accountId/workflows/some-workflow/instances`,
					async () => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: [mockResponse],
						});
					},
					{ once: true }
				)
			);
		};

		it("should describe the bar instance given a name", async () => {
			writeWranglerConfig();
			await mockDescribeInstances();

			await runWrangler(`workflows instances describe some-workflow bar`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				  Name:      event
				  Type:      👀 Waiting for event
				  Start:     [mock-start-date]
				  End:       [mock-end-date]
				  Duration:  4 years
				  Output:    {}
				  Name:      string
				  Type:      🎯 Step
				  Start:     [mock-start-date]
				  End:       [mock-end-date]
				  Duration:  4 years
				  Success:   ✅ Yes
				  Output:    {}
				┌─┬─┬─┬─┬─┐
				│ Start │ End │ Duration │ State │ Error │
				├─┼─┼─┼─┼─┤
				│ [mock-start-date] │ [mock-end-date] │ 4 years │ ✅ Success │ string: string │
				└─┴─┴─┴─┴─┘"
			`);
		});

		it("should describe the latest instance if none is given", async () => {
			writeWranglerConfig();
			await mockDescribeInstances();

			await runWrangler(`workflows instances describe some-workflow`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				  Name:      event
				  Type:      👀 Waiting for event
				  Start:     [mock-start-date]
				  End:       [mock-end-date]
				  Duration:  4 years
				  Output:    {}
				  Name:      string
				  Type:      🎯 Step
				  Start:     [mock-start-date]
				  End:       [mock-end-date]
				  Duration:  4 years
				  Success:   ✅ Yes
				  Output:    {}
				┌─┬─┬─┬─┬─┐
				│ Start │ End │ Duration │ State │ Error │
				├─┼─┼─┼─┼─┤
				│ [mock-start-date] │ [mock-end-date] │ 4 years │ ✅ Success │ string: string │
				└─┴─┴─┴─┴─┘"
			`);
		});
	});

	describe("instances send-event", () => {
		const mockInstances: Instance[] = [
			{
				id: "foo",
				created_on: mockCreateDate.toISOString(),
				modified_on: mockModifiedDate.toISOString(),
				workflow_id: "b",
				version_id: "c",
				status: "running",
			},
		];

		it("should send an event without payload to the bar instance given a name", async () => {
			writeWranglerConfig();
			await mockGetInstances(mockInstances);
			await mockSendEventRequest("bar", "my-event");

			await runWrangler(
				"workflows instances send-event some-workflow bar --type my-event"
			);
			expect(std.info).toMatchInlineSnapshot(
				`"📤 The event with type "my-event" was sent to the instance "bar" from some-workflow"`
			);
		});

		it("should send an event with payload to the bar instance given a name", async () => {
			writeWranglerConfig();
			await mockGetInstances(mockInstances);
			await mockSendEventRequest("bar", "my-event");

			await runWrangler(
				`workflows instances send-event some-workflow bar --type my-event --payload '{"key": "value"}'`
			);
			expect(std.info).toMatchInlineSnapshot(
				`"📤 The event with type "my-event" and payload "{"key": "value"}" was sent to the instance "bar" from some-workflow"`
			);
		});
	});

	describe("instances pause", () => {
		const mockInstances: Instance[] = [
			{
				id: "foo",
				created_on: mockCreateDate.toISOString(),
				modified_on: mockModifiedDate.toISOString(),
				workflow_id: "b",
				version_id: "c",
				status: "running",
			},
			{
				id: "bar",
				created_on: mockCreateDate.toISOString(),
				modified_on: mockModifiedDate.toISOString(),
				workflow_id: "b",
				version_id: "c",
				status: "running",
			},
		];

		it("should get and pause the bar instance given a name", async () => {
			writeWranglerConfig();
			await mockGetInstances(mockInstances);
			await mockChangeStatusRequest("bar");

			await runWrangler(`workflows instances pause some-workflow bar`);
			expect(std.info).toMatchInlineSnapshot(
				`"⏸️ The instance "bar" from some-workflow was paused successfully"`
			);
		});
	});

	describe("instances resume", () => {
		const mockInstances: Instance[] = [
			{
				id: "foo",
				created_on: mockCreateDate.toISOString(),
				modified_on: mockModifiedDate.toISOString(),
				workflow_id: "b",
				version_id: "c",
				status: "running",
			},
			{
				id: "bar",
				created_on: mockCreateDate.toISOString(),
				modified_on: mockModifiedDate.toISOString(),
				workflow_id: "b",
				version_id: "c",
				status: "paused",
			},
		];

		it("should get and resume the bar instance given a name", async () => {
			writeWranglerConfig();
			await mockGetInstances(mockInstances);
			await mockChangeStatusRequest("bar");

			await runWrangler(`workflows instances resume some-workflow bar`);
			expect(std.info).toMatchInlineSnapshot(
				`"🔄 The instance "bar" from some-workflow was resumed successfully"`
			);
		});
	});

	describe("instances terminate", () => {
		const mockInstances: Instance[] = [
			{
				id: "foo",
				created_on: mockCreateDate.toISOString(),
				modified_on: mockModifiedDate.toISOString(),
				workflow_id: "b",
				version_id: "c",
				status: "running",
			},
			{
				id: "bar",
				created_on: mockCreateDate.toISOString(),
				modified_on: mockModifiedDate.toISOString(),
				workflow_id: "b",
				version_id: "c",
				status: "running",
			},
		];

		it("should get and terminate the bar instance given a name", async () => {
			writeWranglerConfig();
			await mockGetInstances(mockInstances);
			await mockChangeStatusRequest("bar");

			await runWrangler(`workflows instances terminate some-workflow bar`);
			expect(std.info).toMatchInlineSnapshot(
				`"🥷 The instance "bar" from some-workflow was terminated successfully"`
			);
		});
	});

	describe("instances restart", () => {
		const mockInstances: Instance[] = [
			{
				id: "foo",
				created_on: mockCreateDate.toISOString(),
				modified_on: mockModifiedDate.toISOString(),
				workflow_id: "b",
				version_id: "c",
				status: "running",
			},
			{
				id: "bar",
				created_on: mockCreateDate.toISOString(),
				modified_on: mockModifiedDate.toISOString(),
				workflow_id: "b",
				version_id: "c",
				status: "running",
			},
		];

		it("should get and restart the bar instance given a name", async () => {
			writeWranglerConfig();
			await mockGetInstances(mockInstances);
			await mockChangeStatusRequest("bar");

			await runWrangler(`workflows instances restart some-workflow bar`);
			expect(std.info).toMatchInlineSnapshot(
				`"🥷 The instance "bar" from some-workflow was restarted successfully"`
			);
		});
	});

	describe("instances terminate-all", () => {
		it("should be able to terminate - job created", async () => {
			writeWranglerConfig();
			await mockInstancesTerminateAll("some-workflow", "ok");

			await runWrangler(`workflows instances terminate-all some-workflow`);
			expect(std.info).toMatchInlineSnapshot(
				`"🥷 A job to terminate instances from Workflow "some-workflow"  has been started. It might take a few minutes to complete."`
			);
		});

		it("should be able to terminate - job exists", async () => {
			writeWranglerConfig();
			await mockInstancesTerminateAll("some-workflow", "ok");

			await runWrangler(`workflows instances terminate-all some-workflow`);
			expect(std.info).toMatchInlineSnapshot(
				`"🥷 A job to terminate instances from Workflow "some-workflow"  has been started. It might take a few minutes to complete."`
			);
		});

		it("should be able to terminate - specific status, job created", async () => {
			writeWranglerConfig();
			await mockInstancesTerminateAll("some-workflow", "ok", "queued");

			await runWrangler(
				`workflows instances terminate-all some-workflow --status queued`
			);
			expect(std.info).toMatchInlineSnapshot(
				`"🥷 A job to terminate instances from Workflow "some-workflow" with status "queued" has been started. It might take a few minutes to complete."`
			);
		});

		it("should be able to terminate - specific status, job exists", async () => {
			writeWranglerConfig();
			await mockInstancesTerminateAll(
				"some-workflow",
				"already_running",
				"queued"
			);

			await runWrangler(
				`workflows instances terminate-all some-workflow --status queued`
			);
			expect(std.info).toMatchInlineSnapshot(
				`"🥷 A job to terminate instances from Workflow "some-workflow" with status "queued" is already running. It might take a few minutes to complete."`
			);
		});

		it("invalid status", async () => {
			writeWranglerConfig();
			await expect(
				runWrangler(
					`workflows instances terminate-all some-workflow --status not-a-status`
				)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Provided status "not-a-status" is not valid, it must be one of the following: queued, running, paused, waitingForPause, waiting.]`
			);
			expect(std.err).toMatchInlineSnapshot(
				`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mProvided status "not-a-status" is not valid, it must be one of the following: queued, running, paused, waitingForPause, waiting.[0m

				"
			`
			);
		});
	});

	describe("trigger", () => {
		const mockTriggerWorkflow = async () => {
			msw.use(
				http.post(
					`*/accounts/:accountId/workflows/some-workflow/instances`,
					async () => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: {
								id: "3c70754a-8435-4498-92ad-22e2e2c90853",
								status: "queued",
								version_id: "9e94c502-ca41-4342-a7f7-af96b444512c",
								workflow_id: "03e70e31-d7a4-4401-a629-6a4b6096cdfe",
							},
						});
					},
					{ once: true }
				)
			);
		};

		it("should trigger a workflow given a name", async () => {
			writeWranglerConfig();
			await mockTriggerWorkflow();

			await runWrangler(`workflows trigger some-workflow`);
			expect(std);
			expect(std.info).toMatchInlineSnapshot(
				`"🚀 Workflow instance "3c70754a-8435-4498-92ad-22e2e2c90853" has been queued successfully"`
			);
		});
	});

	describe("delete", () => {
		it("should delete a workflow - green path", async () => {
			writeWranglerConfig();

			await mockDeleteWorkflowRequest("some-workflow");

			await runWrangler(`workflows delete some-workflow`);
			expect(std.out).toMatchInlineSnapshot(
				`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				✅ Workflow "some-workflow" removed successfully.
				 Note that running instances might take a few minutes to be properly terminated."
			`
			);
		});
	});

	describe("workflow binding validation", () => {
		it("should validate workflow binding with valid name", async () => {
			writeWorkerSource({ format: "ts" });
			writeWranglerConfig({
				main: "index.ts",
				workflows: [
					{
						binding: "MY_WORKFLOW",
						name: "valid-workflow-name",
						class_name: "MyWorkflow",
						script_name: "external-script",
					},
				],
			});

			await runWrangler("deploy --dry-run");
			expect(std.err).toBe("");
		});

		it("should reject workflow binding with name exceeding 64 characters", async () => {
			const longName = "a".repeat(65); // 65 characters
			writeWranglerConfig({
				workflows: [
					{
						binding: "MY_WORKFLOW",
						name: longName,
						class_name: "MyWorkflow",
					},
				],
			});

			await expect(runWrangler("deploy --dry-run")).rejects.toThrow();
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mProcessing wrangler.toml configuration:[0m

				    - "workflows[0]" binding "name" field is invalid. Workflow names must be 1-64 characters long,
				  start with a letter, number, or underscore, and may only contain letters, numbers, underscores, or
				  hyphens.

				"
			`);
		});

		it.each(["", "   ", "\n\nhello", "#1231231!!!!", "-badName"])(
			"should reject workflow binding with name with invalid characters",
			async function (invalidName) {
				writeWranglerConfig({
					workflows: [
						{
							binding: "MY_WORKFLOW",
							name: invalidName,
							class_name: "MyWorkflow",
						},
					],
				});

				await expect(runWrangler("deploy --dry-run")).rejects.toThrow();
				expect(std.err).toContain('binding "name" field is invalid');
			}
		);

		it("should accept workflow binding with name exactly 64 characters", async () => {
			const maxLengthName = "a".repeat(64); // exactly 64 characters
			writeWorkerSource({ format: "ts" });
			writeWranglerConfig({
				main: "index.ts",
				workflows: [
					{
						binding: "MY_WORKFLOW",
						name: maxLengthName,
						class_name: "MyWorkflow",
						script_name: "external-script",
					},
				],
			});

			await runWrangler("deploy --dry-run");
			expect(std.err).toBe("");
		});

		it("should validate required fields for workflow binding", async () => {
			writeWranglerConfig({
				workflows: [
					{
						binding: "MY_WORKFLOW",
					} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				],
			});

			await expect(runWrangler("deploy --dry-run")).rejects.toThrow();
			expect(std.err).toContain('should have a string "name" field');
			expect(std.err).toContain('should have a string "class_name" field');
		});

		it("should validate optional fields for workflow binding", async () => {
			writeWorkerSource({ format: "ts" });
			writeWranglerConfig({
				main: "index.ts",
				workflows: [
					{
						binding: "MY_WORKFLOW",
						name: "my-workflow",
						class_name: "MyWorkflow",
						script_name: "external-script",
						remote: true,
					},
				],
			});

			await runWrangler("deploy --dry-run");
			expect(std.err).toBe("");
		});

		it("should reject workflow binding with invalid field types", async () => {
			writeWranglerConfig({
				workflows: [
					{
						binding: 123, // should be string
						name: "my-workflow",
						class_name: "MyWorkflow",
					} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				],
			});

			await expect(runWrangler("deploy --dry-run")).rejects.toThrow();
			expect(std.err).toContain('should have a string "binding" field');
		});

		it("should reject workflow binding that is not an object", async () => {
			writeWranglerConfig({
				workflows: ["invalid-workflow-config"] as any, // eslint-disable-line @typescript-eslint/no-explicit-any
			});

			await expect(runWrangler("deploy --dry-run")).rejects.toThrow();
			expect(std.err).toContain('"workflows" bindings should be objects');
		});

		it("should accept workflow binding with valid limits", async () => {
			fs.writeFileSync(
				"index.js",
				"import { WorkflowEntrypoint } from 'cloudflare:workers';\nexport default {};\nexport class MyWorkflow extends WorkflowEntrypoint {};"
			);
			writeWranglerConfig({
				main: "index.js",
				workflows: [
					{
						binding: "MY_WORKFLOW",
						name: "my-workflow",
						class_name: "MyWorkflow",
						limits: { steps: 5000 },
					},
				],
			});

			await runWrangler("deploy --dry-run");
			expect(std.err).toBe("");
		});

		it("should accept workflow binding with empty limits object", async () => {
			fs.writeFileSync(
				"index.js",
				"import { WorkflowEntrypoint } from 'cloudflare:workers';\nexport default {};\nexport class MyWorkflow extends WorkflowEntrypoint {};"
			);
			writeWranglerConfig({
				main: "index.js",
				workflows: [
					{
						binding: "MY_WORKFLOW",
						name: "my-workflow",
						class_name: "MyWorkflow",
						limits: {},
					},
				],
			});

			await runWrangler("deploy --dry-run");
			expect(std.err).toBe("");
		});

		it("should accept workflow binding with limits.steps at boundary value 1", async () => {
			fs.writeFileSync(
				"index.js",
				"import { WorkflowEntrypoint } from 'cloudflare:workers';\nexport default {};\nexport class MyWorkflow extends WorkflowEntrypoint {};"
			);
			writeWranglerConfig({
				main: "index.js",
				workflows: [
					{
						binding: "MY_WORKFLOW",
						name: "my-workflow",
						class_name: "MyWorkflow",
						limits: { steps: 1 },
					},
				],
			});

			await runWrangler("deploy --dry-run");
			expect(std.err).toBe("");
		});

		it("should reject workflow binding with limits.steps of 0", async () => {
			writeWranglerConfig({
				workflows: [
					{
						binding: "MY_WORKFLOW",
						name: "my-workflow",
						class_name: "MyWorkflow",
						limits: { steps: 0 },
					} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				],
			});

			await expect(runWrangler("deploy --dry-run")).rejects.toThrow();
			expect(std.err).toContain(
				'"limits.steps" field must be a positive integer'
			);
		});

		it("should reject workflow binding with non-integer limits.steps", async () => {
			writeWranglerConfig({
				workflows: [
					{
						binding: "MY_WORKFLOW",
						name: "my-workflow",
						class_name: "MyWorkflow",
						limits: { steps: 1.5 },
					} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				],
			});

			await expect(runWrangler("deploy --dry-run")).rejects.toThrow();
			expect(std.err).toContain(
				'"limits.steps" field must be a positive integer'
			);
		});

		it("should reject workflow binding with negative limits.steps", async () => {
			writeWranglerConfig({
				workflows: [
					{
						binding: "MY_WORKFLOW",
						name: "my-workflow",
						class_name: "MyWorkflow",
						limits: { steps: -1 },
					} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				],
			});

			await expect(runWrangler("deploy --dry-run")).rejects.toThrow();
			expect(std.err).toContain(
				'"limits.steps" field must be a positive integer'
			);
		});

		it("should reject workflow binding with non-object limits", async () => {
			writeWranglerConfig({
				workflows: [
					{
						binding: "MY_WORKFLOW",
						name: "my-workflow",
						class_name: "MyWorkflow",
						limits: "invalid",
					} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				],
			});

			await expect(runWrangler("deploy --dry-run")).rejects.toThrow();
			expect(std.err).toContain(
				'should, optionally, have an object "limits" field'
			);
		});

		it("should reject workflow binding with array limits", async () => {
			writeWranglerConfig({
				workflows: [
					{
						binding: "MY_WORKFLOW",
						name: "my-workflow",
						class_name: "MyWorkflow",
						limits: [1, 2, 3],
					} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
				],
			});

			await expect(runWrangler("deploy --dry-run")).rejects.toThrow();
			expect(std.err).toContain(
				'should, optionally, have an object "limits" field'
			);
		});

		it("should warn on unexpected fields in workflow binding limits", async () => {
			writeWorkerSource({ format: "ts" });
			writeWranglerConfig({
				main: "index.ts",
				workflows: [
					{
						binding: "MY_WORKFLOW",
						name: "my-workflow",
						class_name: "MyWorkflow",
						script_name: "external-script",
						limits: {
							steps: 10,
							// @ts-expect-error Testing unexpected fields in limits
							unknownProp: "foo",
						},
					},
				],
			});

			await runWrangler("deploy --dry-run");
			expect(std.warn).toContain(
				'Unexpected fields found in workflows[0].limits field: "unknownProp"'
			);
		});

		it("should warn when step limit exceeds production maximum", async () => {
			fs.writeFileSync(
				"index.js",
				"import { WorkflowEntrypoint } from 'cloudflare:workers';\nexport default {};\nexport class MyWorkflow extends WorkflowEntrypoint {};"
			);
			writeWranglerConfig(
				{
					main: "index.js",
					workflows: [
						{
							binding: "MY_WORKFLOW",
							name: "my-workflow",
							class_name: "MyWorkflow",
							limits: { steps: 30_000 },
						},
					],
				},
				"./wrangler.json"
			);

			await runWrangler("deploy --dry-run --config wrangler.json");
			expect(std.warn).toContain(
				"has a step limit of 30000, which exceeds the production maximum of 25,000"
			);
		});

		it("should not warn when step limit is within production maximum", async () => {
			fs.writeFileSync(
				"index.js",
				"import { WorkflowEntrypoint } from 'cloudflare:workers';\nexport default {};\nexport class MyWorkflow extends WorkflowEntrypoint {};"
			);
			writeWranglerConfig(
				{
					main: "index.js",
					workflows: [
						{
							binding: "MY_WORKFLOW",
							name: "my-workflow",
							class_name: "MyWorkflow",
							limits: { steps: 25_000 },
						},
					],
				},
				"./wrangler.json"
			);

			await runWrangler("deploy --dry-run --config wrangler.json");
			expect(std.warn).not.toContain("step limit");
		});

		it("should reject workflows binding with same name", async () => {
			writeWorkerSource({ format: "ts" });
			writeWranglerConfig({
				main: "index.ts",
				workflows: [
					{
						binding: "MY_WORKFLOW",
						name: "duplicate-workflow-name",
						class_name: "MyWorkflow",
						script_name: "external-script",
					},
					{
						binding: "MY_WORKFLOW_2",
						name: "duplicate-workflow-name",
						class_name: "MyWorkflow2",
						script_name: "external-script-2",
					},
					{
						binding: "MY_WORKFLOW_3",
						name: "valid-workflow-name",
						class_name: "MyWorkflow3",
						script_name: "external-script-3",
					},
					{
						binding: "MY_WORKFLOW_4",
						name: "duplicate-workflow-name-2",
						class_name: "MyWorkflow4",
						script_name: "external-script-4",
					},
					{
						binding: "MY_WORKFLOW_5",
						name: "duplicate-workflow-name-2",
						class_name: "MyWorkflow5",
						script_name: "external-script-5",
					},
				],
			});
			await expect(runWrangler("deploy --dry-run")).rejects.toThrow();

			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mProcessing wrangler.toml configuration:[0m

				    - "workflows" bindings must have unique "name" values; duplicate(s) found:
				  "duplicate-workflow-name", "duplicate-workflow-name-2"

				"
			`);
		});
	});

	// =========================================================================
	// Local commands (--local) — hitting /cdn-cgi/explorer/api/workflows/...
	// =========================================================================

	describe("local", () => {
		const LOCAL_PORT = 8787;
		const LOCAL_BASE = `http://localhost:${LOCAL_PORT}/cdn-cgi/explorer/api`;

		describe("workflows list --local", () => {
			it("should list workflows from local dev session", async () => {
				writeWranglerConfig();

				msw.use(
					http.get(`${LOCAL_BASE}/workflows`, () => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: [
								{
									name: "my-workflow",
									class_name: "MyWorkflow",
									script_name: "my-worker",
								},
							],
							result_info: { count: 1 },
						});
					})
				);

				await runWrangler("workflows list --local");
				expect(std.info).toMatchInlineSnapshot(
					`"Showing 1 workflow from local dev session:"`
				);
			});

			it("should warn when no local workflows exist", async () => {
				writeWranglerConfig();

				msw.use(
					http.get(`${LOCAL_BASE}/workflows`, () => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: [],
							result_info: { count: 0 },
						});
					})
				);

				await runWrangler("workflows list --local");
				expect(std.warn).toContain(
					"There are no Workflows in the local dev session"
				);
			});
		});

		describe("workflows describe --local", () => {
			it("should describe a workflow from local dev session", async () => {
				writeWranglerConfig();

				msw.use(
					http.get(`${LOCAL_BASE}/workflows/:workflowName`, ({ params }) => {
						expect(params.workflowName).toEqual("my-workflow");
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: {
								name: "my-workflow",
								class_name: "MyWorkflow",
								script_name: "my-worker",
								instances: {
									complete: 2,
									errored: 1,
									paused: 0,
									queued: 0,
									running: 0,
									terminated: 0,
									waiting: 0,
									waitingForPause: 0,
								},
							},
						});
					})
				);

				await runWrangler("workflows describe my-workflow --local");
				// logRaw writes to process.stdout directly, not captured by std.out
				// Verify the command completes successfully without error
				expect(std.err).toBe("");
			});
		});

		describe("workflows trigger --local", () => {
			it("should trigger a workflow in local dev session", async () => {
				writeWranglerConfig();

				msw.use(
					http.post(
						`${LOCAL_BASE}/workflows/:workflowName/instances`,
						async ({ params, request }) => {
							expect(params.workflowName).toEqual("my-workflow");
							const body = (await request.json()) as Record<string, unknown>;
							expect(body.params).toEqual({ foo: "bar" });
							return HttpResponse.json({
								success: true,
								errors: [],
								messages: [],
								result: { id: "local-instance-123" },
							});
						}
					)
				);

				await runWrangler(
					`workflows trigger my-workflow '{"foo":"bar"}' --local`
				);
				expect(std.info).toMatchInlineSnapshot(
					`"🚀 Workflow instance "local-instance-123" has been triggered successfully"`
				);
			});

			it("should trigger without params in local dev session", async () => {
				writeWranglerConfig();

				msw.use(
					http.post(`${LOCAL_BASE}/workflows/:workflowName/instances`, () => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: { id: "local-instance-456" },
						});
					})
				);

				await runWrangler("workflows trigger my-workflow --local");
				expect(std.info).toMatchInlineSnapshot(
					`"🚀 Workflow instance "local-instance-456" has been triggered successfully"`
				);
			});
		});

		describe("workflows delete --local", () => {
			it("should delete a workflow in local dev session", async () => {
				writeWranglerConfig();

				msw.use(
					http.delete(`${LOCAL_BASE}/workflows/:workflowName`, ({ params }) => {
						expect(params.workflowName).toEqual("my-workflow");
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: { status: "ok", success: true },
						});
					})
				);

				await runWrangler("workflows delete my-workflow --local");
				expect(std.out).toContain(
					'Workflow "my-workflow" instances removed successfully from local dev session.'
				);
			});
		});

		describe("workflows instances list --local", () => {
			it("should list instances from local dev session", async () => {
				writeWranglerConfig();

				msw.use(
					http.get(
						`${LOCAL_BASE}/workflows/:workflowName/instances`,
						({ params }) => {
							expect(params.workflowName).toEqual("my-workflow");
							return HttpResponse.json({
								success: true,
								errors: [],
								messages: [],
								result: [
									{
										id: "instance-1",
										status: "running",
										created_on: mockCreateDate.toISOString(),
									},
									{
										id: "instance-2",
										status: "complete",
										created_on: mockCreateDate.toISOString(),
									},
								],
								result_info: {
									page: 1,
									per_page: 25,
									total_count: 2,
									total_pages: 1,
								},
							});
						}
					)
				);

				await runWrangler("workflows instances list my-workflow --local");
				expect(std.info).toMatchInlineSnapshot(
					`"Showing 2 instances from page 1:"`
				);
			});

			it("should warn when no local instances exist", async () => {
				writeWranglerConfig();

				msw.use(
					http.get(`${LOCAL_BASE}/workflows/:workflowName/instances`, () => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: [],
							result_info: {
								page: 1,
								per_page: 25,
								total_count: 0,
								total_pages: 0,
							},
						});
					})
				);

				await runWrangler("workflows instances list my-workflow --local");
				expect(std.warn).toContain(
					'There are no instances in workflow "my-workflow"'
				);
			});
		});

		describe("workflows instances describe --local", () => {
			it("should describe an instance from local dev session", async () => {
				writeWranglerConfig();

				msw.use(
					http.get(
						`${LOCAL_BASE}/workflows/:workflowName/instances/:instanceId`,
						({ params }) => {
							expect(params.workflowName).toEqual("my-workflow");
							expect(params.instanceId).toEqual("instance-123");
							return HttpResponse.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									status: "complete",
									params: { input: "data" },
									queued: mockQueuedDate.toISOString(),
									start: mockStartDate.toISOString(),
									end: mockEndDate.toISOString(),
									output: "done",
									error: null,
									steps: [
										{
											name: "step1",
											start: mockStartDate.toISOString(),
											end: mockEndDate.toISOString(),
											success: true,
											type: "step",
											output: "result",
											config: {
												retries: {
													limit: 3,
													delay: 1000,
													backoff: "constant",
												},
												timeout: 30000,
											},
											attempts: [
												{
													start: mockStartDate.toISOString(),
													end: mockEndDate.toISOString(),
													success: true,
													error: null,
												},
											],
										},
									],
									step_count: 1,
									versionId: "version-abc",
									success: true,
									trigger: { source: "api" },
								},
							});
						}
					)
				);

				await runWrangler(
					"workflows instances describe my-workflow instance-123 --local"
				);
				// Step details go through logger.log → std.out
				expect(std.out).toContain("step1");
				expect(std.out).toContain("Step");
			});
		});

		describe("workflows instances pause --local", () => {
			it("should pause an instance in local dev session", async () => {
				writeWranglerConfig();

				msw.use(
					http.patch(
						`${LOCAL_BASE}/workflows/:workflowName/instances/:instanceId/status`,
						async ({ params, request }) => {
							expect(params.workflowName).toEqual("my-workflow");
							expect(params.instanceId).toEqual("instance-123");
							const body = (await request.json()) as Record<string, unknown>;
							expect(body.action).toEqual("pause");
							return HttpResponse.json({
								success: true,
								errors: [],
								messages: [],
								result: { success: true },
							});
						}
					)
				);

				await runWrangler(
					"workflows instances pause my-workflow instance-123 --local"
				);
				expect(std.info).toMatchInlineSnapshot(
					`"⏸️ The instance "instance-123" from my-workflow was paused successfully"`
				);
			});
		});

		describe("workflows instances resume --local", () => {
			it("should resume an instance in local dev session", async () => {
				writeWranglerConfig();

				msw.use(
					http.patch(
						`${LOCAL_BASE}/workflows/:workflowName/instances/:instanceId/status`,
						async ({ params, request }) => {
							expect(params.workflowName).toEqual("my-workflow");
							expect(params.instanceId).toEqual("instance-123");
							const body = (await request.json()) as Record<string, unknown>;
							expect(body.action).toEqual("resume");
							return HttpResponse.json({
								success: true,
								errors: [],
								messages: [],
								result: { success: true },
							});
						}
					)
				);

				await runWrangler(
					"workflows instances resume my-workflow instance-123 --local"
				);
				expect(std.info).toMatchInlineSnapshot(
					`"🔄 The instance "instance-123" from my-workflow was resumed successfully"`
				);
			});
		});

		describe("workflows instances terminate --local", () => {
			it("should terminate an instance in local dev session", async () => {
				writeWranglerConfig();

				msw.use(
					http.patch(
						`${LOCAL_BASE}/workflows/:workflowName/instances/:instanceId/status`,
						async ({ params, request }) => {
							expect(params.workflowName).toEqual("my-workflow");
							expect(params.instanceId).toEqual("instance-123");
							const body = (await request.json()) as Record<string, unknown>;
							expect(body.action).toEqual("terminate");
							return HttpResponse.json({
								success: true,
								errors: [],
								messages: [],
								result: { success: true },
							});
						}
					)
				);

				await runWrangler(
					"workflows instances terminate my-workflow instance-123 --local"
				);
				expect(std.info).toMatchInlineSnapshot(
					`"🥷 The instance "instance-123" from my-workflow was terminated successfully"`
				);
			});
		});

		describe("workflows instances restart --local", () => {
			it("should restart an instance in local dev session", async () => {
				writeWranglerConfig();

				msw.use(
					http.patch(
						`${LOCAL_BASE}/workflows/:workflowName/instances/:instanceId/status`,
						async ({ params, request }) => {
							expect(params.workflowName).toEqual("my-workflow");
							expect(params.instanceId).toEqual("instance-123");
							const body = (await request.json()) as Record<string, unknown>;
							expect(body.action).toEqual("restart");
							return HttpResponse.json({
								success: true,
								errors: [],
								messages: [],
								result: { success: true },
							});
						}
					)
				);

				await runWrangler(
					"workflows instances restart my-workflow instance-123 --local"
				);
				expect(std.info).toMatchInlineSnapshot(
					`"🥷 The instance "instance-123" from my-workflow was restarted successfully"`
				);
			});
		});

		describe("workflows instances send-event --local", () => {
			it("should send an event to an instance in local dev session", async () => {
				writeWranglerConfig();

				msw.use(
					http.post(
						`${LOCAL_BASE}/workflows/:workflowName/instances/:instanceId/events/:eventType`,
						async ({ params, request }) => {
							expect(params.workflowName).toEqual("my-workflow");
							expect(params.instanceId).toEqual("instance-123");
							expect(params.eventType).toEqual("my-event");
							const body = (await request.json()) as Record<string, unknown>;
							expect(body).toEqual({ key: "value" });
							return HttpResponse.json({
								success: true,
								errors: [],
								messages: [],
								result: { success: true },
							});
						}
					)
				);

				await runWrangler(
					`workflows instances send-event my-workflow instance-123 --type my-event --payload '{"key":"value"}' --local`
				);
				expect(std.info).toMatchInlineSnapshot(
					`"📤 The event with type "my-event" and payload "{"key":"value"}" was sent to the instance "instance-123" from my-workflow"`
				);
			});

			it("should send an event without payload in local dev session", async () => {
				writeWranglerConfig();

				msw.use(
					http.post(
						`${LOCAL_BASE}/workflows/:workflowName/instances/:instanceId/events/:eventType`,
						({ params }) => {
							expect(params.workflowName).toEqual("my-workflow");
							expect(params.instanceId).toEqual("instance-123");
							expect(params.eventType).toEqual("my-event");
							return HttpResponse.json({
								success: true,
								errors: [],
								messages: [],
								result: { success: true },
							});
						}
					)
				);

				await runWrangler(
					"workflows instances send-event my-workflow instance-123 --type my-event --local"
				);
				expect(std.info).toMatchInlineSnapshot(
					`"📤 The event with type "my-event" was sent to the instance "instance-123" from my-workflow"`
				);
			});
		});

		describe("latest instance resolution --local", () => {
			it("should resolve 'latest' to the most recent instance", async () => {
				writeWranglerConfig();

				msw.use(
					http.get(`${LOCAL_BASE}/workflows/:workflowName/instances`, () => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: [
								{
									id: "older-instance",
									status: "complete",
									created_on: "2024-01-01T00:00:00Z",
								},
								{
									id: "newest-instance",
									status: "running",
									created_on: "2024-06-01T00:00:00Z",
								},
							],
							result_info: {
								page: 1,
								per_page: 25,
								total_count: 2,
								total_pages: 1,
							},
						});
					}),
					http.patch(
						`${LOCAL_BASE}/workflows/:workflowName/instances/:instanceId/status`,
						({ params }) => {
							expect(params.instanceId).toEqual("newest-instance");
							return HttpResponse.json({
								success: true,
								errors: [],
								messages: [],
								result: { success: true },
							});
						}
					)
				);

				await runWrangler(
					"workflows instances pause my-workflow latest --local"
				);
				expect(std.info).toContain("newest-instance");
			});
		});
	});
});
