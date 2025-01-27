import { http, HttpResponse } from "msw";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs } from "./helpers/mock-dialogs";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWranglerConfig } from "./helpers/write-wrangler-config";
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

	const mockPatchRequest = async (expectedInstance: string) => {
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

	describe("help", () => {
		it("should show help when no argument is passed", async () => {
			writeWranglerConfig();

			await runWrangler(`workflows`);
			await endEventLoop();

			expect(std.out).toMatchInlineSnapshot(
				`
				"wrangler workflows

				🔁 Manage Workflows [open-beta]

				COMMANDS
				  wrangler workflows list                     List Workflows associated to account [open-beta]
				  wrangler workflows describe <name>          Describe Workflow resource [open-beta]
				  wrangler workflows trigger <name> [params]  Trigger a workflow, creating a new instance. Can optionally take a JSON string to pass a parameter into the workflow instance [open-beta]
				  wrangler workflows instances                Manage Workflow instances [open-beta]

				GLOBAL FLAGS
				  -c, --config   Path to Wrangler configuration file  [string]
				  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				  -h, --help     Show help  [boolean]
				  -v, --version  Show version number  [boolean]"
			`
			);
		});
	});

	describe("instances help", () => {
		it("should show instance help when no argument is passed", async () => {
			writeWranglerConfig();

			await runWrangler(`workflows instances`);
			await endEventLoop();

			expect(std.out).toMatchInlineSnapshot(
				`
				"wrangler workflows instances

				Manage Workflow instances [open-beta]

				COMMANDS
				  wrangler workflows instances list <name>            Instance related commands (list, describe, terminate, pause, resume) [open-beta]
				  wrangler workflows instances describe <name> <id>   Describe a workflow instance - see its logs, retries and errors [open-beta]
				  wrangler workflows instances terminate <name> <id>  Terminate a workflow instance [open-beta]
				  wrangler workflows instances pause <name> <id>      Pause a workflow instance [open-beta]
				  wrangler workflows instances resume <name> <id>     Resume a workflow instance [open-beta]

				GLOBAL FLAGS
				  -c, --config   Path to Wrangler configuration file  [string]
				  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				  -h, --help     Show help  [boolean]
				  -v, --version  Show version number  [boolean]"
			`
			);
		});
	});

	describe("list", () => {
		const mockWorkflows: Workflow[] = [
			{
				class_name: "wf_class_1",
				created_on: "2021-01-01T00:00:00Z",
				id: "wf_id_1",
				modified_on: "2021-01-01T00:00:00Z",
				name: "wf_1",
				script_name: "wf_script_1",
			},
			{
				class_name: "wf_class_2",
				created_on: "2022-01-01T00:00:00Z",
				id: "wf_id_2",
				modified_on: "2022-01-01T00:00:00Z",
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
			expect(std.info).toMatchInlineSnapshot(`"Showing last 2 workflows:"`);
			expect(std.out).toMatchInlineSnapshot(
				`
"┌──────┬─────────────┬────────────┬───────────────────────┬───────────────────────┐
│ Name │ Script name │ Class name │ Created               │ Modified              │
├──────┼─────────────┼────────────┼───────────────────────┼───────────────────────┤
│ wf_1 │ wf_script_1 │ wf_class_1 │ 1/1/2021, 12:00:00 AM │ 1/1/2021, 12:00:00 AM │
├──────┼─────────────┼────────────┼───────────────────────┼───────────────────────┤
│ wf_2 │ wf_script_2 │ wf_class_2 │ 1/1/2022, 12:00:00 AM │ 1/1/2022, 12:00:00 AM │
└──────┴─────────────┴────────────┴───────────────────────┴───────────────────────┘"
			`
			);
		});
	});

	describe("instances list", () => {
		const mockInstances: Instance[] = [
			{
				id: "foo",
				created_on: "2021-01-01T00:00:00Z",
				modified_on: "2021-01-01T00:00:00Z",
				workflow_id: "b",
				version_id: "c",
				status: "running",
			},
			{
				id: "bar",
				created_on: "2022-01-01T00:00:00Z",
				modified_on: "2022-01-01T00:00:00Z",
				workflow_id: "b",
				version_id: "c",
				status: "running",
			},
		];

		it("should get the list of instances given a name", async () => {
			writeWranglerConfig();
			await mockGetInstances(mockInstances);

			await runWrangler(`workflows instances list some-workflow`);
			expect(std.info).toMatchInlineSnapshot(
				`"Showing 2 instances from page 1:"`
			);
			expect(std.out).toMatchInlineSnapshot(
				`
"┌─────┬─────────┬───────────────────────┬───────────────────────┬───────────┐
│ Id  │ Version │ Created               │ Modified              │ Status    │
├─────┼─────────┼───────────────────────┼───────────────────────┼───────────┤
│ bar │ c       │ 1/1/2022, 12:00:00 AM │ 1/1/2022, 12:00:00 AM │ ▶ Running │
├─────┼─────────┼───────────────────────┼───────────────────────┼───────────┤
│ foo │ c       │ 1/1/2021, 12:00:00 AM │ 1/1/2021, 12:00:00 AM │ ▶ Running │
└─────┴─────────┴───────────────────────┴───────────────────────┴───────────┘"
			`
			);
		});
	});

	describe("instances describe", () => {
		const mockDescribeInstances = async () => {
			const mockResponse = {
				end: "2021-01-01T00:00:00Z",
				output: "string",
				params: {},
				queued: "2021-01-01T00:00:00Z",
				start: "2021-01-01T00:00:00Z",
				status: "queued",
				success: true,
				trigger: {
					source: "unknown",
				},
				versionId: "14707576-2549-4848-82ed-f68f8a1b47c7",
				steps: [
					{
						attempts: [
							{
								end: "2021-01-01T00:00:00Z",
								error: {
									message: "string",
									name: "string",
								},
								start: "2021-01-01T00:00:00Z",
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
						end: "2021-01-01T00:00:00Z",
						name: "string",
						output: {},
						start: "2021-01-01T00:00:00Z",
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
				)
			);
		};

		it("should describe the bar instance given a name", async () => {
			writeWranglerConfig();
			await mockDescribeInstances();

			await runWrangler(`workflows instances describe some-workflow bar`);
			expect(std.out).toMatchInlineSnapshot(`
"┌───────────────────────┬───────────────────────┬───────────┬────────────┬────────────────┐
│ Start                 │ End                   │ Duration  │ State      │ Error          │
├───────────────────────┼───────────────────────┼───────────┼────────────┼────────────────┤
│ 1/1/2021, 12:00:00 AM │ 1/1/2021, 12:00:00 AM │ 0 seconds │ ✅ Success │ string: string │
└───────────────────────┴───────────────────────┴───────────┴────────────┴────────────────┘"
			`);
		});
	});

	describe("instances pause", () => {
		const mockInstances: Instance[] = [
			{
				id: "foo",
				created_on: "2021-01-01T00:00:00Z",
				modified_on: "2021-01-01T00:00:00Z",
				workflow_id: "b",
				version_id: "c",
				status: "running",
			},
			{
				id: "bar",
				created_on: "2022-01-01T00:00:00Z",
				modified_on: "2022-01-01T00:00:00Z",
				workflow_id: "b",
				version_id: "c",
				status: "running",
			},
		];

		it("should get and pause the bar instance given a name", async () => {
			writeWranglerConfig();
			await mockGetInstances(mockInstances);
			await mockPatchRequest("bar");

			await runWrangler(`workflows instances pause some-workflow bar`);
			expect(std.info).toMatchInlineSnapshot(
				`"⏸️ The instance \\"bar\\" from some-workflow was paused successfully"`
			);
		});
	});

	describe("instances resume", () => {
		const mockInstances: Instance[] = [
			{
				id: "foo",
				created_on: "2021-01-01T00:00:00Z",
				modified_on: "2021-01-01T00:00:00Z",
				workflow_id: "b",
				version_id: "c",
				status: "running",
			},
			{
				id: "bar",
				created_on: "2022-01-01T00:00:00Z",
				modified_on: "2022-01-01T00:00:00Z",
				workflow_id: "b",
				version_id: "c",
				status: "paused",
			},
		];

		it("should get and resume the bar instance given a name", async () => {
			writeWranglerConfig();
			await mockGetInstances(mockInstances);
			await mockPatchRequest("bar");

			await runWrangler(`workflows instances resume some-workflow bar`);
			expect(std.info).toMatchInlineSnapshot(
				`"🔄 The instance \\"bar\\" from some-workflow was resumed successfully"`
			);
		});
	});

	describe("instances terminate", () => {
		const mockInstances: Instance[] = [
			{
				id: "foo",
				created_on: "2021-01-01T00:00:00Z",
				modified_on: "2021-01-01T00:00:00Z",
				workflow_id: "b",
				version_id: "c",
				status: "running",
			},
			{
				id: "bar",
				created_on: "2022-01-01T00:00:00Z",
				modified_on: "2022-01-01T00:00:00Z",
				workflow_id: "b",
				version_id: "c",
				status: "running",
			},
		];

		it("should get and terminate the bar instance given a name", async () => {
			writeWranglerConfig();
			await mockGetInstances(mockInstances);
			await mockPatchRequest("bar");

			await runWrangler(`workflows instances terminate some-workflow bar`);
			expect(std.info).toMatchInlineSnapshot(
				`"🥷 The instance \\"bar\\" from some-workflow was terminated successfully"`
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
				`"🚀 Workflow instance \\"3c70754a-8435-4498-92ad-22e2e2c90853\\" has been queued successfully"`
			);
		});
	});

	describe("delete", () => {
		it("should delete a workflow - check not implemented", async () => {
			writeWranglerConfig();

			await runWrangler(`workflows delete some-workflow`);
			expect(std.out).toMatchInlineSnapshot(
				`"🚫 Workflow \\"some-workflow\\" NOT removed"`
			);
			expect(std.info).toMatchInlineSnapshot(
				`"🚫 delete command not yet implement"`
			);
		});
	});
});
