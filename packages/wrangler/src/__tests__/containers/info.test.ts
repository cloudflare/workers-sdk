import { http, HttpResponse } from "msw";
import patchConsole from "patch-console";
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
			"wrangler containers info [ID]

			get information about a specific container

			POSITIONALS
			  ID  id of the containers to view  [string]

			GLOBAL FLAGS
			  -c, --config   Path to Wrangler configuration file  [string]
			      --cwd      Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]

			OPTIONS
			      --json  Return output as clean JSON  [boolean] [default: false]"
		`);
	});

	it("should show a single container when given an ID (json)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get(
				"*/applications/asdf",
				async ({ request }) => {
					expect(await request.text()).toEqual("");
					return HttpResponse.json(MOCK_APPLICATION_SINGLE);
				},
				{ once: true }
			)
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		await runWrangler("containers info asdf");
		expect(std.out).toMatchInlineSnapshot(`"{}"`);
	});

	it("should error when not given an ID", async () => {
		await expect(
			runWrangler("containers info")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: You must provide an ID. Use 'wrangler containers list\` to view your containers.]`
		);
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou must provide an ID. Use 'wrangler containers list\` to view your containers.[0m

			"
		`);
	});
});
