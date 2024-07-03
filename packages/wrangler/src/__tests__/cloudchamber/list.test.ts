import { http, HttpResponse } from "msw";
import patchConsole from "patch-console";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { MOCK_DEPLOYMENTS_COMPLEX } from "../helpers/mock-cloudchamber";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { mockAccount, setWranglerConfig } from "./utils";

describe("cloudchamber list", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	mockAccountId();
	mockApiToken();
	runInTempDir();
	beforeEach(mockAccount);

	afterEach(() => {
		patchConsole(() => {});
		msw.resetHandlers();
	});

	it("should help", async () => {
		await runWrangler("cloudchamber list --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler cloudchamber list [deploymentIdPrefix]

			List and view status of deployments

			POSITIONALS
			  deploymentIdPrefix  Optional deploymentId to filter deployments
			                      This means that 'list' will only showcase deployments that contain this ID prefix  [string]

			GLOBAL FLAGS
			  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]

			OPTIONS
			      --json      Return output as clean JSON  [boolean] [default: false]
			      --location  Filter deployments by location  [string]
			      --image     Filter deployments by image  [string]
			      --state     Filter deployments by deployment state  [string]
			      --ipv4      Filter deployments by ipv4 address  [string]
			      --label     Filter deployments by labels  [array]"
		`);
	});

	it("should list deployments (json)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get(
				"*/deployments/v2",
				async ({ request }) => {
					expect(await request.text()).toEqual("");
					return HttpResponse.json(MOCK_DEPLOYMENTS_COMPLEX);
				},
				{ once: true }
			)
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		await runWrangler("cloudchamber list");
		// so testing the actual UI will be harder than expected
		// TODO: think better on how to test UI actions
		expect(std.out).toMatchInlineSnapshot(`
		"[
		    {
		        \\"id\\": \\"1\\",
		        \\"type\\": \\"default\\",
		        \\"created_at\\": \\"123\\",
		        \\"account_id\\": \\"123\\",
		        \\"vcpu\\": 4,
		        \\"memory\\": \\"400MB\\",
		        \\"version\\": 1,
		        \\"image\\": \\"hello\\",
		        \\"location\\": {
		            \\"name\\": \\"sfo06\\",
		            \\"enabled\\": true
		        },
		        \\"network\\": {
		            \\"ipv4\\": \\"1.1.1.1\\"
		        },
		        \\"placements_ref\\": \\"http://ref\\",
		        \\"node_group\\": \\"metal\\"
		    },
		    {
		        \\"id\\": \\"2\\",
		        \\"type\\": \\"default\\",
		        \\"created_at\\": \\"1234\\",
		        \\"account_id\\": \\"123\\",
		        \\"vcpu\\": 4,
		        \\"memory\\": \\"400MB\\",
		        \\"version\\": 2,
		        \\"image\\": \\"hello\\",
		        \\"location\\": {
		            \\"name\\": \\"sfo06\\",
		            \\"enabled\\": true
		        },
		        \\"network\\": {
		            \\"ipv4\\": \\"1.1.1.2\\"
		        },
		        \\"current_placement\\": {
		            \\"deployment_version\\": 2,
		            \\"status\\": {
		                \\"health\\": \\"running\\"
		            },
		            \\"deployment_id\\": \\"2\\",
		            \\"terminate\\": false,
		            \\"created_at\\": \\"123\\",
		            \\"id\\": \\"1\\"
		        },
		        \\"placements_ref\\": \\"http://ref\\",
		        \\"node_group\\": \\"metal\\"
		    },
		    {
		        \\"id\\": \\"3\\",
		        \\"type\\": \\"default\\",
		        \\"created_at\\": \\"123\\",
		        \\"account_id\\": \\"123\\",
		        \\"vcpu\\": 4,
		        \\"memory\\": \\"400MB\\",
		        \\"version\\": 1,
		        \\"image\\": \\"hello\\",
		        \\"location\\": {
		            \\"name\\": \\"sfo06\\",
		            \\"enabled\\": true
		        },
		        \\"network\\": {
		            \\"ipv4\\": \\"1.1.1.1\\"
		        },
		        \\"placements_ref\\": \\"http://ref\\",
		        \\"node_group\\": \\"metal\\"
		    },
		    {
		        \\"id\\": \\"4\\",
		        \\"type\\": \\"default\\",
		        \\"created_at\\": \\"1234\\",
		        \\"account_id\\": \\"123\\",
		        \\"vcpu\\": 4,
		        \\"memory\\": \\"400MB\\",
		        \\"version\\": 2,
		        \\"image\\": \\"hello\\",
		        \\"location\\": {
		            \\"name\\": \\"sfo06\\",
		            \\"enabled\\": true
		        },
		        \\"network\\": {
		            \\"ipv4\\": \\"1.1.1.2\\"
		        },
		        \\"current_placement\\": {
		            \\"deployment_version\\": 2,
		            \\"status\\": {
		                \\"health\\": \\"running\\"
		            },
		            \\"deployment_id\\": \\"2\\",
		            \\"terminate\\": false,
		            \\"created_at\\": \\"123\\",
		            \\"id\\": \\"1\\"
		        },
		        \\"placements_ref\\": \\"http://ref\\",
		        \\"node_group\\": \\"metal\\"
		    }
		]"
	`);
	});
});
