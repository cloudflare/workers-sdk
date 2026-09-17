import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import * as user from "../../user";
import { mockAccount, setWranglerConfig } from "../cloudchamber/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";

const MOCK_APPLICATION_SINGLE = `{"id":"asdf","created_at":"2025-02-14T18:03:13.268999936Z","account_id":"test-account","name":"app-test","version":1,"configuration":{"image":"registry.test.cfdata.org/test-app:v1","network":{"mode":"private"}},"scheduling_policy":"regional","instances":2,"jobs":false,"constraints":{"region":"WNAM"},"durable_objects":{"namespace_id":"test-id"},"health":{"instances":{"healthy":2,"failed":0,"scheduling":0,"starting":0}}}`;
const APPLICATION_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const NAMESPACE_APPLICATION_ID = "7d88cd87be4b402387fd3aafa1d461af";

describe("containers info", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	mockAccountId();
	mockApiToken();
	beforeEach(mockAccount);

	afterEach(() => {
		msw.resetHandlers();
	});

	it("should help", async ({ expect }) => {
		await runWrangler("containers info --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler containers info <ID>

			Get information about a container application

			POSITIONALS
			  ID  ID of the container application to view  [string] [required]

			GLOBAL FLAGS
			  -c, --config          Path to Wrangler configuration file  [string]
			      --cwd             Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env             Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file        Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help            Show help  [boolean]
			      --install-skills  Install Cloudflare skills for detected AI coding agents before running the command  [boolean] [default: false]
			      --profile         Use a specific auth profile  [string]
			  -v, --version         Show version number  [boolean]

			OPTIONS
			      --json  Return output as JSON  [boolean] [default: false]"
		`);
	});

	it("should show the correct authentication error", async ({ expect }) => {
		const spy = vi.spyOn(user, "getScopes");
		spy.mockReset();
		spy.mockImplementationOnce(() => []);
		setIsTTY(false);
		setWranglerConfig({});
		await expect(
			runWrangler("containers info asdf")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: You need 'containers:write', try logging in again or creating an appropiate API token]`
		);
	});

	it("should output JSON via --json flag in TTY mode", async ({ expect }) => {
		setIsTTY(true);
		setWranglerConfig({});
		msw.use(
			http.get(
				`*/applications/${APPLICATION_ID}`,
				async ({ request }) => {
					expect(await request.text()).toEqual("");
					return HttpResponse.json(
						`{"success": true, "result": ${MOCK_APPLICATION_SINGLE}}`
					);
				},
				{ once: true }
			)
		);
		await runWrangler(`containers info ${APPLICATION_ID.toUpperCase()} --json`);
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"{
			    "id": "asdf",
			    "created_at": "2025-02-14T18:03:13.268999936Z",
			    "account_id": "test-account",
			    "name": "app-test",
			    "version": 1,
			    "configuration": {
			        "image": "registry.test.cfdata.org/test-app:v1",
			        "network": {
			            "mode": "private"
			        }
			    },
			    "scheduling_policy": "regional",
			    "instances": 2,
			    "jobs": false,
			    "constraints": {
			        "region": "WNAM"
			    },
			    "durable_objects": {
			        "namespace_id": "test-id"
			    },
			    "health": {
			        "instances": {
			            "healthy": 2,
			            "failed": 0,
			            "scheduling": 0,
			            "starting": 0
			        }
			    }
			}"
		`);
	});

	it("should reject an actor ID as an application ID", async ({ expect }) => {
		setIsTTY(false);
		setWranglerConfig({});

		await expect(
			runWrangler(`containers info ${"a".repeat(64)} --json`)
		).rejects.toThrow("Expected an application ID");
	});

	it("should get a namespace-backed application by its namespace ID", async ({
		expect,
	}) => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get(
				"*/applications/:id",
				async ({ params, request }) => {
					expect(params.id).toBe(NAMESPACE_APPLICATION_ID);
					expect(await request.text()).toEqual("");
					return HttpResponse.json({
						success: true,
						result: {
							id: NAMESPACE_APPLICATION_ID,
							created_at: "2026-09-16T16:55:40Z",
							updated_at: "2026-09-16T17:02:58Z",
							account_id: "some-account-id",
							name: "chess-match",
							scheduling_policy: "durable_object",
							durable_objects: { namespace_id: NAMESPACE_APPLICATION_ID },
						},
						errors: [],
						messages: [],
					});
				},
				{ once: true }
			)
		);

		await runWrangler(`containers info ${NAMESPACE_APPLICATION_ID} --json`);

		expect(JSON.parse(std.out)).toMatchObject({
			id: NAMESPACE_APPLICATION_ID,
			name: "chess-match",
			scheduling_policy: "durable_object",
			durable_objects: { namespace_id: NAMESPACE_APPLICATION_ID },
		});
	});

	it("should throw JsonFriendlyFatalError on unexpected API error with --json", async ({
		expect,
	}) => {
		setIsTTY(true);
		setWranglerConfig({});
		msw.use(
			http.get(
				`*/applications/${APPLICATION_ID}`,
				async () => {
					return HttpResponse.json(
						{
							success: false,
							result: null,
							errors: [{ code: 2000, message: "boom" }],
						},
						{ status: 500 }
					);
				},
				{ once: true }
			)
		);
		await expect(
			runWrangler(`containers info ${APPLICATION_ID} --json`)
		).rejects.toThrow(/There has been an internal error/);
		expect(() => JSON.parse(std.out)).not.toThrow();
		expect(JSON.parse(std.out)).toHaveProperty("error");
	});

	it("should show a single container application when given an ID", async ({
		expect,
	}) => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get(
				`*/applications/${APPLICATION_ID}`,
				async ({ request }) => {
					expect(await request.text()).toEqual("");
					return HttpResponse.json(
						`{"success": true, "result": ${MOCK_APPLICATION_SINGLE}}`
					);
				},
				{ once: true }
			)
		);
		await runWrangler(`containers info ${APPLICATION_ID}`);
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"{
			    "id": "asdf",
			    "created_at": "2025-02-14T18:03:13.268999936Z",
			    "account_id": "test-account",
			    "name": "app-test",
			    "version": 1,
			    "configuration": {
			        "image": "registry.test.cfdata.org/test-app:v1",
			        "network": {
			            "mode": "private"
			        }
			    },
			    "scheduling_policy": "regional",
			    "instances": 2,
			    "jobs": false,
			    "constraints": {
			        "region": "WNAM"
			    },
			    "durable_objects": {
			        "namespace_id": "test-id"
			    },
			    "health": {
			        "instances": {
			            "healthy": 2,
			            "failed": 0,
			            "scheduling": 0,
			            "starting": 0
			        }
			    }
			}"
		`);
	});

	it("should error when not given an ID", async ({ expect }) => {
		await expect(
			runWrangler("containers info")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Not enough non-option arguments: got 0, need at least 1]`
		);
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

			"
		`);
	});
});
