import { rest } from "msw";
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

		Positionals:
		  deploymentIdPrefix  Optional deploymentId to filter deployments
		                      This means that 'list' will only showcase deployments that contain this ID prefix  [string]

		Flags:
		  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
		  -c, --config                    Path to .toml configuration file  [string]
		  -e, --env                       Environment to use for operations and .env files  [string]
		  -h, --help                      Show help  [boolean]
		  -v, --version                   Show version number  [boolean]

		Options:
		      --json      Return output as clean JSON  [boolean] [default: false]
		      --location  Filter deployments by location  [string]
		      --image     Filter deployments by image  [string]
		      --state     Filter deployments by deployment state  [string]
		      --ipv4      Filter deployments by ipv4 address  [string]"
	`);
	});

	it("should list deployments (json)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			rest.get("*/deployments", async (request, response, context) => {
				expect(await request.text()).toEqual("");
				return response.once(context.json(MOCK_DEPLOYMENTS_COMPLEX));
			})
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		await runWrangler("cloudchamber list");
		// so testing the actual UI will be harder than expected
		// TODO: think better on how to test UI actions
		expect(std.out).toMatchInlineSnapshot(`
		"[
		    {
		        \\"id\\": \\"1\\",
		        \\"created_at\\": \\"123\\",
		        \\"account_id\\": \\"123\\",
		        \\"vcpu\\": 4,
		        \\"memory\\": \\"400MB\\",
		        \\"version\\": 1,
		        \\"image\\": \\"hello\\",
		        \\"location\\": \\"sfo06\\",
		        \\"ipv4\\": \\"1.1.1.1\\",
		        \\"current_placement\\": null,
		        \\"placements_ref\\": \\"http://ref\\",
		        \\"node_group\\": \\"metal\\"
		    },
		    {
		        \\"id\\": \\"2\\",
		        \\"created_at\\": \\"1234\\",
		        \\"account_id\\": \\"123\\",
		        \\"vcpu\\": 4,
		        \\"memory\\": \\"400MB\\",
		        \\"version\\": 2,
		        \\"image\\": \\"hello\\",
		        \\"location\\": \\"sfo06\\",
		        \\"ipv4\\": \\"1.1.1.2\\",
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
		        \\"created_at\\": \\"123\\",
		        \\"account_id\\": \\"123\\",
		        \\"vcpu\\": 4,
		        \\"memory\\": \\"400MB\\",
		        \\"version\\": 1,
		        \\"image\\": \\"hello\\",
		        \\"location\\": \\"sfo06\\",
		        \\"ipv4\\": \\"1.1.1.1\\",
		        \\"current_placement\\": null,
		        \\"placements_ref\\": \\"http://ref\\",
		        \\"node_group\\": \\"metal\\"
		    },
		    {
		        \\"id\\": \\"4\\",
		        \\"created_at\\": \\"1234\\",
		        \\"account_id\\": \\"123\\",
		        \\"vcpu\\": 4,
		        \\"memory\\": \\"400MB\\",
		        \\"version\\": 2,
		        \\"image\\": \\"hello\\",
		        \\"location\\": \\"sfo06\\",
		        \\"ipv4\\": \\"1.1.1.2\\",
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
