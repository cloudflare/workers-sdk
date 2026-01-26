import { http, HttpResponse } from "msw";
import patchConsole from "patch-console";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as user from "../../user";
import { mockAccount, setWranglerConfig } from "../cloudchamber/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";

const MOCK_APPLICATION_SINGLE = `{"id":"asdf","created_at":"2025-02-14T18:03:13.268999936Z","account_id":"test-account","name":"app-test","version":1,"configuration":{"image":"registry.test.cfdata.org/test-app:v1","network":{"mode":"private"}},"scheduling_policy":"regional","instances":2,"jobs":false,"constraints":{"region":"WNAM"},"durable_objects":{"namespace_id":"test-id"},"health":{"instances":{"healthy":2,"failed":0,"scheduling":0,"starting":0}}}`;

describe("containers info", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	mockAccountId();
	mockApiToken();
	beforeEach(mockAccount);

	afterEach(() => {
		patchConsole(() => {});
		msw.resetHandlers();
	});

	it("should help", async () => {
		await runWrangler("containers info --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler containers info <ID>

			Get information about a specific container [open beta]

			POSITIONALS
			  ID  ID of the container to view  [string] [required]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	it("should show the correct authentication error", async () => {
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

	it("should show a single container when given an ID (json)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get(
				"*/applications/asdf",
				async ({ request }) => {
					expect(await request.text()).toEqual("");
					return HttpResponse.json(
						`{"success": true, "result": ${MOCK_APPLICATION_SINGLE}}`
					);
				},
				{ once: true }
			)
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		await runWrangler("containers info asdf");
		expect(std.out).toMatchInlineSnapshot(`
			"{
			    \\"id\\": \\"asdf\\",
			    \\"created_at\\": \\"2025-02-14T18:03:13.268999936Z\\",
			    \\"account_id\\": \\"test-account\\",
			    \\"name\\": \\"app-test\\",
			    \\"version\\": 1,
			    \\"configuration\\": {
			        \\"image\\": \\"registry.test.cfdata.org/test-app:v1\\",
			        \\"network\\": {
			            \\"mode\\": \\"private\\"
			        }
			    },
			    \\"scheduling_policy\\": \\"regional\\",
			    \\"instances\\": 2,
			    \\"jobs\\": false,
			    \\"constraints\\": {
			        \\"region\\": \\"WNAM\\"
			    },
			    \\"durable_objects\\": {
			        \\"namespace_id\\": \\"test-id\\"
			    },
			    \\"health\\": {
			        \\"instances\\": {
			            \\"healthy\\": 2,
			            \\"failed\\": 0,
			            \\"scheduling\\": 0,
			            \\"starting\\": 0
			        }
			    }
			}"
		`);
	});

	it("should error when not given an ID", async () => {
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
