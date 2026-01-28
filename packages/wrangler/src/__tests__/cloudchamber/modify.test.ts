import { http, HttpResponse } from "msw";
import patchConsole from "patch-console";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { MOCK_DEPLOYMENTS_COMPLEX } from "../helpers/mock-cloudchamber";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { mockAccount, setWranglerConfig } from "./utils";

function mockDeployment() {
	msw.use(
		http.patch(
			"*/deployments/1234/v2",
			async ({ request }) => {
				expect(await request.text()).toBe(
					`{"image":"hello:modify","location":"sfo06","environment_variables":[{"name":"HELLO","value":"WORLD"},{"name":"YOU","value":"CONQUERED"}],"labels":[{"name":"appname","value":"helloworld"},{"name":"region","value":"wnam"}],"vcpu":3,"memory_mib":40}`
				);
				return HttpResponse.json(MOCK_DEPLOYMENTS_COMPLEX[0]);
			},
			{ once: true }
		)
	);
}

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

			Modify an existing deployment [alpha]

			POSITIONALS
			  deploymentId  The deployment you want to modify  [string]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]

			OPTIONS
			      --var                Container environment variables  [array]
			      --label              Deployment labels  [array]
			      --ssh-public-key-id  Public SSH key IDs to include in this container. You can add one to your account with \`wrangler cloudchamber ssh create  [array]
			      --image              The new image that the deployment will have from now on  [string]
			      --location           The new location that the deployment will have from now on  [string]
			      --instance-type      The new instance type that the deployment will have from now on  [choices: \\"dev\\", \\"basic\\", \\"standard\\"]
			      --vcpu               The new vcpu that the deployment will have from now on  [number]
			      --memory             The new memory that the deployment will have from now on  [string]"
		`);
	});

	it("should modify deployment (detects no interactivity)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		mockDeployment();
		await runWrangler(
			"cloudchamber modify 1234 --image hello:modify --location sfo06 --var HELLO:WORLD --var YOU:CONQUERED --label appname:helloworld --label region:wnam --vcpu 3 --memory 40MB"
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
			    \\"memory_mib\\": 400,
			    \\"version\\": 1,
			    \\"image\\": \\"hello\\",
			    \\"location\\": {
			        \\"name\\": \\"sfo06\\",
			        \\"enabled\\": true
			    },
			    \\"network\\": {
			        \\"mode\\": \\"public\\",
			        \\"ipv4\\": \\"1.1.1.1\\"
			    },
			    \\"placements_ref\\": \\"http://ref\\",
			    \\"node_group\\": \\"metal\\"
			}"
		`);
	});

	it("should modify deployment with wrangler args (detects no interactivity)", async () => {
		setIsTTY(false);
		setWranglerConfig({
			image: "hello:modify",
			vcpu: 3,
			memory: "40MB",
			location: "sfo06",
		});
		mockDeployment();
		await runWrangler(
			"cloudchamber modify 1234 --var HELLO:WORLD --var YOU:CONQUERED --label appname:helloworld --label region:wnam"
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"{
			    \\"id\\": \\"1\\",
			    \\"type\\": \\"default\\",
			    \\"created_at\\": \\"123\\",
			    \\"account_id\\": \\"123\\",
			    \\"vcpu\\": 4,
			    \\"memory\\": \\"400MB\\",
			    \\"memory_mib\\": 400,
			    \\"version\\": 1,
			    \\"image\\": \\"hello\\",
			    \\"location\\": {
			        \\"name\\": \\"sfo06\\",
			        \\"enabled\\": true
			    },
			    \\"network\\": {
			        \\"mode\\": \\"public\\",
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
