import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import * as user from "../../user";
import { mockAccount, setWranglerConfig } from "../cloudchamber/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";

const MOCK_INSTANCES = {
	instances: [
		{
			id: "11111111-1111-1111-1111-111111111111",
			created_at: "2025-06-01T10:00:00Z",
			location: "sfo06",
			app_version: 3,
			current_placement: {
				id: "placement-1",
				created_at: "2025-06-01T10:00:00Z",
				deployment_id: "11111111-1111-1111-1111-111111111111",
				deployment_version: 1,
				terminate: false,
				status: {
					health: "running",
					container_status: "running",
				},
			},
		},
		{
			id: "22222222-2222-2222-2222-222222222222",
			created_at: "2025-06-01T11:00:00Z",
			location: "iad01",
			app_version: 2,
			current_placement: {
				id: "placement-2",
				created_at: "2025-06-01T11:00:00Z",
				deployment_id: "22222222-2222-2222-2222-222222222222",
				deployment_version: 1,
				terminate: false,
				status: {
					health: "placed",
				},
			},
		},
	],
	durable_objects: [],
};

const MOCK_DO_INSTANCES = {
	instances: [
		{
			id: "deploy-aaaa",
			created_at: "2025-06-01T10:00:00Z",
			location: "dfw01",
			app_version: 57,
			current_placement: {
				id: "placement-a",
				created_at: "2025-06-01T10:00:00Z",
				deployment_id: "deploy-aaaa",
				deployment_version: 1,
				terminate: false,
				status: { health: "running", container_status: "running" },
			},
		},
	],
	durable_objects: [
		{
			id: "do-instance-1111",
			deployment_id: "deploy-aaaa",
			placement_id: "placement-a",
			assigned_at: "2025-06-01T10:00:00Z",
			name: "random-76",
		},
		{
			id: "do-instance-2222",
			assigned_at: "2025-05-26T10:00:00Z",
			name: "random-88",
		},
	],
};

const APP_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("containers instances", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	mockAccountId();
	mockApiToken();
	beforeEach(mockAccount);

	afterEach(() => {
		msw.resetHandlers();
	});

	it("should help", async ({ expect }) => {
		await runWrangler("containers instances --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler containers instances <ID>

			List container instances for an application [open beta]

			POSITIONALS
			  ID  ID of the application to list instances for  [string] [required]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]

			OPTIONS
			      --per-page  Number of instances per page  [number] [default: 25]
			      --json      Return output as JSON  [boolean] [default: false]"
		`);
	});

	it("should show the correct authentication error", async ({ expect }) => {
		const spy = vi.spyOn(user, "getScopes");
		spy.mockReset();
		spy.mockImplementationOnce(() => []);
		setIsTTY(false);
		setWranglerConfig({});
		await expect(
			runWrangler(`containers instances ${APP_ID}`)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: You need 'containers:write', try logging in again or creating an appropiate API token]`
		);
	});

	it("should render a table (non-TTY)", async ({ expect }) => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get(
				"*/dash/applications/*/instances",
				async ({ request }) => {
					expect(await request.text()).toEqual("");
					return HttpResponse.json({
						success: true,
						result: MOCK_INSTANCES,
						result_info: { per_page: 50 },
						errors: [],
						messages: [],
					});
				},
				{ once: true }
			)
		);
		await runWrangler(`containers instances ${APP_ID}`);
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"┌─┬─┬─┬─┬─┐
			│ INSTANCE │ STATE │ LOCATION │ VERSION │ CREATED │
			├─┼─┼─┼─┼─┤
			│ 11111111-1111-1111-1111-111111111111 │ running │ sfo06 │ 3 │ 2025-06-01T10:00:00Z │
			├─┼─┼─┼─┼─┤
			│ 22222222-2222-2222-2222-222222222222 │ provisioning │ iad01 │ 2 │ 2025-06-01T11:00:00Z │
			└─┴─┴─┴─┴─┘"
		`);
	});

	it("should render DO instance table (non-TTY)", async ({ expect }) => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get(
				"*/dash/applications/*/instances",
				async () => {
					return HttpResponse.json({
						success: true,
						result: MOCK_DO_INSTANCES,
						result_info: { per_page: 50 },
						errors: [],
						messages: [],
					});
				},
				{ once: true }
			)
		);
		await runWrangler(`containers instances ${APP_ID}`);
		expect(std.out).toMatchInlineSnapshot(`
			"┌─┬─┬─┬─┬─┬─┐
			│ INSTANCE │ NAME │ STATE │ LOCATION │ VERSION │ CREATED │
			├─┼─┼─┼─┼─┼─┤
			│ do-instance-1111 │ random-76 │ running │ dfw01 │ 57 │ 2025-06-01T10:00:00Z │
			├─┼─┼─┼─┼─┼─┤
			│ do-instance-2222 │ random-88 │ inactive │ - │ - │ 2025-05-26T10:00:00Z │
			└─┴─┴─┴─┴─┴─┘"
		`);
	});

	it("should reject --per-page 0", async ({ expect }) => {
		setIsTTY(false);
		setWranglerConfig({});
		await expect(
			runWrangler(`containers instances ${APP_ID} --per-page 0`)
		).rejects.toThrowError(/--per-page must be at least 1/);
	});

	it("should reject --per-page with negative value", async ({ expect }) => {
		setIsTTY(false);
		setWranglerConfig({});
		await expect(
			runWrangler(`containers instances ${APP_ID} --per-page -1`)
		).rejects.toThrowError(/--per-page must be at least 1/);
	});

	it("should error on invalid ID format", async ({ expect }) => {
		setIsTTY(false);
		setWranglerConfig({});
		await expect(
			runWrangler("containers instances not-a-uuid")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Expected an application ID but got not-a-uuid. Use \`wrangler containers list\` to view your containers and corresponding IDs.]`
		);
	});

	it("should error on missing ID", async ({ expect }) => {
		await expect(
			runWrangler("containers instances")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Not enough non-option arguments: got 0, need at least 1]`
		);
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

			"
		`);
	});

	it("should handle empty instance list", async ({ expect }) => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get(
				"*/dash/applications/*/instances",
				async () => {
					return HttpResponse.json({
						success: true,
						result: { instances: [], durable_objects: [] },
						result_info: { per_page: 50 },
						errors: [],
						messages: [],
					});
				},
				{ once: true }
			)
		);
		await runWrangler(`containers instances ${APP_ID}`);
		expect(std.out).toContain("No instances found");
	});

	it("should fetch all results in a single unpaginated request (non-TTY)", async ({
		expect,
	}) => {
		setIsTTY(false);
		setWranglerConfig({});
		let requestCount = 0;
		msw.use(
			http.get(
				"*/dash/applications/*/instances",
				async ({ request }) => {
					requestCount++;
					const url = new URL(request.url);
					// Non-interactive omits per_page so the API returns everything
					expect(url.searchParams.has("per_page")).toBe(false);
					expect(url.searchParams.has("page_token")).toBe(false);
					return HttpResponse.json({
						success: true,
						result: MOCK_INSTANCES,
						result_info: { per_page: 50 },
						errors: [],
						messages: [],
					});
				},
				{ once: true }
			)
		);
		await runWrangler(`containers instances ${APP_ID}`);
		expect(requestCount).toBe(1);
		// Table output should contain both instances
		expect(std.out).toContain("11111111-1111-1111-1111-111111111111");
		expect(std.out).toContain("22222222-2222-2222-2222-222222222222");
	});

	describe("--json", () => {
		it("should output flat JSON matching table columns for non-DO apps", async ({
			expect,
		}) => {
			setIsTTY(false);
			setWranglerConfig({});
			msw.use(
				http.get(
					"*/dash/applications/*/instances",
					async () => {
						return HttpResponse.json({
							success: true,
							result: MOCK_INSTANCES,
							result_info: { per_page: 50 },
							errors: [],
							messages: [],
						});
					},
					{ once: true }
				)
			);
			await runWrangler(`containers instances ${APP_ID} --json`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			const output = JSON.parse(std.out);
			expect(output).toHaveLength(2);
			expect(output[0]).toEqual({
				id: "11111111-1111-1111-1111-111111111111",
				state: "running",
				location: "sfo06",
				version: 3,
				created: "2025-06-01T10:00:00Z",
			});
			expect(output[1]).toEqual({
				id: "22222222-2222-2222-2222-222222222222",
				state: "provisioning",
				location: "iad01",
				version: 2,
				created: "2025-06-01T11:00:00Z",
			});
		});

		it("should include name field for DO-backed apps", async ({ expect }) => {
			setIsTTY(false);
			setWranglerConfig({});
			msw.use(
				http.get(
					"*/dash/applications/*/instances",
					async () => {
						return HttpResponse.json({
							success: true,
							result: MOCK_DO_INSTANCES,
							result_info: { per_page: 50 },
							errors: [],
							messages: [],
						});
					},
					{ once: true }
				)
			);
			await runWrangler(`containers instances ${APP_ID} --json`);
			const output = JSON.parse(std.out);
			expect(output).toHaveLength(2);
			// DO with a running deployment
			expect(output[0]).toEqual({
				id: "do-instance-1111",
				name: "random-76",
				state: "running",
				location: "dfw01",
				version: 57,
				created: "2025-06-01T10:00:00Z",
			});
			// DO without a running deployment (inactive)
			expect(output[1]).toEqual({
				id: "do-instance-2222",
				name: "random-88",
				state: "inactive",
				location: null,
				version: null,
				created: "2025-05-26T10:00:00Z",
			});
		});

		it("should output empty array for no instances", async ({ expect }) => {
			setIsTTY(false);
			setWranglerConfig({});
			msw.use(
				http.get(
					"*/dash/applications/*/instances",
					async () => {
						return HttpResponse.json({
							success: true,
							result: { instances: [], durable_objects: [] },
							result_info: { per_page: 50 },
							errors: [],
							messages: [],
						});
					},
					{ once: true }
				)
			);
			await runWrangler(`containers instances ${APP_ID} --json`);
			const output = JSON.parse(std.out);
			expect(output).toEqual([]);
		});

		it("should fetch all results in a single unpaginated request", async ({
			expect,
		}) => {
			setIsTTY(false);
			setWranglerConfig({});
			let requestCount = 0;
			msw.use(
				http.get(
					"*/dash/applications/*/instances",
					async ({ request }) => {
						requestCount++;
						const url = new URL(request.url);
						// --json omits per_page so the API returns everything
						expect(url.searchParams.has("per_page")).toBe(false);
						expect(url.searchParams.has("page_token")).toBe(false);
						return HttpResponse.json({
							success: true,
							result: MOCK_INSTANCES,
							result_info: { per_page: 50 },
							errors: [],
							messages: [],
						});
					},
					{ once: true }
				)
			);
			await runWrangler(`containers instances ${APP_ID} --json`);
			expect(requestCount).toBe(1);
			const output = JSON.parse(std.out);
			expect(output).toHaveLength(2);
			expect(output[0].id).toBe("11111111-1111-1111-1111-111111111111");
			expect(output[1].id).toBe("22222222-2222-2222-2222-222222222222");
		});
	});
});
