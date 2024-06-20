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

describe("cloudchamber modify", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	mockAccountId();
	mockApiToken();
	beforeEach(mockAccount);
	runInTempDir();
	afterEach(() => {
		patchConsole(() => {});
		msw.resetHandlers();
	});

	it("should help", async () => {
		await runWrangler("cloudchamber modify --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler cloudchamber modify [deploymentId]

			Modify an existing deployment

			POSITIONALS
			  deploymentId  The deployment you want to modify  [string]

			GLOBAL FLAGS
			  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]

			OPTIONS
			      --json               Return output as clean JSON  [boolean] [default: false]
			      --var                Container environment variables  [array]
			      --label              Deployment labels  [array]
			      --ssh-public-key-id  Public SSH key IDs to include in this container. You can add one to your account with \`wrangler cloudchamber ssh create  [array]
			      --image              The new image that the deployment will have from now on  [string]
			      --location           The new location that the deployment will have from now on  [string]
			      --vcpu               The new vcpu that the deployment will have from now on  [number]
			      --memory             The new memory that the deployment will have from now on  [string]"
		`);
	});

	it("should modify deployment (detects no interactivity)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.patch(
				"*/deployments/1234/v2",
				async ({ request }) => {
					expect(await request.text()).toMatchInlineSnapshot(
						`"{\\"image\\":\\"hello:modify\\",\\"environment_variables\\":[{\\"name\\":\\"HELLO\\",\\"value\\":\\"WORLD\\"},{\\"name\\":\\"YOU\\",\\"value\\":\\"CONQUERED\\"}],\\"vcpu\\":3,\\"memory\\":\\"40MB\\"}"`
					);
					return HttpResponse.json(MOCK_DEPLOYMENTS_COMPLEX[0]);
				},
				{ once: true }
			)
		);
		await runWrangler(
			"cloudchamber modify 1234 --image hello:modify --var HELLO:WORLD --var YOU:CONQUERED --vcpu 3 --memory 40MB"
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		// so testing the actual UI will be harder than expected
		// TODO: think better on how to test UI actions
		expect(std.out).toMatchInlineSnapshot(`
		"{
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
		}"
	`);
	});

	it("can't modify deployment due to lack of deploymentId (json)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		expect(std.err).toMatchInlineSnapshot(`""`);
		await expect(
			runWrangler("cloudchamber modify --image hello:world")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: there needs to be a deploymentId when you can't interact with the wrangler cli]`
		);
		// so testing the actual UI will be harder than expected
		// TODO: think better on how to test UI actions
		expect(std.out).toMatchInlineSnapshot(`
		"
		[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
	`);
	});
});
