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
import type { SSHPublicKeyItem } from "../../cloudchamber/client";

describe("cloudchamber create", () => {
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
		await runWrangler("cloudchamber create --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
		"wrangler cloudchamber create

		Create a new deployment

		Flags:
		  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
		  -c, --config                    Path to .toml configuration file  [string]
		  -e, --env                       Environment to use for operations and .env files  [string]
		  -h, --help                      Show help  [boolean]
		  -v, --version                   Show version number  [boolean]

		Options:
		      --json          Return output as clean JSON  [boolean] [default: false]
		      --image         Image to use for your deployment  [string]
		      --location      Location on Cloudflare's network where your deployment will run  [string]
		      --var           Container environment variables  [array]
		      --all-ssh-keys  To add all SSH keys configured on your account to be added to this deployment, set this option to true  [boolean]
		      --ssh-key-id    ID of the SSH key to add to the deployment  [array]
		      --vcpu          Number of vCPUs to allocate to this deployment.  [number]
		      --memory        Amount of memory (GB, MB...) to allocate to this deployment. Ex: 4GB.  [string]"
	`);
	});

	it("should create deployment (detects no interactivity)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			rest.get("*/ssh-public-keys", async (request, response, context) => {
				const keys = [
					{ id: "1", name: "hello", public_key: "hello-world" },
				] as SSHPublicKeyItem[];
				return response.once(context.json(keys));
			})
		);
		msw.use(
			rest.post("*/deployments", async (request, response, context) => {
				expect(await request.text()).toMatchInlineSnapshot(
					`"{\\"image\\":\\"hello:world\\",\\"location\\":\\"sfo06\\",\\"ssh_public_key_ids\\":[],\\"environment_variables\\":[{\\"name\\":\\"HELLO\\",\\"value\\":\\"WORLD\\"},{\\"name\\":\\"YOU\\",\\"value\\":\\"CONQUERED\\"}],\\"vcpu\\":3,\\"memory\\":\\"400GB\\"}"`
				);
				return response.once(context.json(MOCK_DEPLOYMENTS_COMPLEX[0]));
			})
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		await runWrangler(
			"cloudchamber create --image hello:world --location sfo06 --var HELLO:WORLD --var YOU:CONQUERED --vcpu 3 --memory 400GB"
		);
		// so testing the actual UI will be harder than expected
		// TODO: think better on how to test UI actions
		expect(std.out).toMatchInlineSnapshot(`
		"{
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
		}"
	`);
	});

	it("should create deployment indicating ssh keys (detects no interactivity)", async () => {
		setIsTTY(false);
		setWranglerConfig({
			vcpu: 40,
			memory: "300MB",
		});
		msw.use(
			rest.get("*/ssh-public-keys", async (request, response, context) => {
				const keys = [
					{ id: "1", name: "hello", public_key: "hello-world" },
				] as SSHPublicKeyItem[];
				return response.once(context.json(keys));
			})
		);
		msw.use(
			rest.post("*/deployments", async (request, response, context) => {
				expect(await request.text()).toMatchInlineSnapshot(
					`"{\\"image\\":\\"hello:world\\",\\"location\\":\\"sfo06\\",\\"ssh_public_key_ids\\":[\\"1\\"],\\"environment_variables\\":[{\\"name\\":\\"HELLO\\",\\"value\\":\\"WORLD\\"},{\\"name\\":\\"YOU\\",\\"value\\":\\"CONQUERED\\"}],\\"vcpu\\":40,\\"memory\\":\\"300MB\\"}"`
				);
				return response.once(context.json(MOCK_DEPLOYMENTS_COMPLEX[0]));
			})
		);
		await runWrangler(
			"cloudchamber create --image hello:world --location sfo06 --var HELLO:WORLD --var YOU:CONQUERED --all-ssh-keys"
		);
		expect(std.out).toMatchInlineSnapshot(`
		"{
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
		}"
	`);
	});

	it("can't create deployment due to lack of fields (json)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		expect(std.err).toMatchInlineSnapshot(`""`);
		await expect(
			runWrangler("cloudchamber create")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`"image is required but it's not passed as an argument"`
		);
		// so testing the actual UI will be harder than expected
		// TODO: think better on how to test UI actions
		expect(std.out).toMatchInlineSnapshot(`
		"
		[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
	`);
	});
});
