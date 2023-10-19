import { rest } from "msw";
import patchConsole from "patch-console";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { mockAccount, setWranglerConfig } from "./utils";

describe("cloudchamber image", () => {
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
		await runWrangler("cloudchamber registries --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
		"wrangler cloudchamber registries

		Configure and interact with docker registries

		Commands:
		  wrangler cloudchamber registries configure             Configure Cloudchamber to pull from specific registries
		  wrangler cloudchamber registries credentials [domain]  get a temporary password for a specific domain

		Flags:
		  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
		  -c, --config                    Path to .toml configuration file  [string]
		  -e, --env                       Environment to use for operations and .env files  [string]
		  -h, --help                      Show help  [boolean]
		  -v, --version                   Show version number  [boolean]

		Options:
		      --json  if this is true, wrangler will output json only  [boolean] [default: false]"
	`);
	});

	it("should create an image registry (no interactivity)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			rest.post("*/registries", async (request, response, context) => {
				expect(await request.json()).toEqual({
					domain: "docker.io",
					public: false,
				});
				return response.once(
					context.json({
						domain: "docker.io",
					})
				);
			})
		);

		await runWrangler(
			"cloudchamber registries configure --domain docker.io --public false"
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		// so testing the actual UI will be harder than expected
		// TODO: think better on how to test UI actions
		expect(std.out).toMatchInlineSnapshot(`
		"{
		    \\"domain\\": \\"docker.io\\"
		}"
	`);
	});

	it("should create an image registry (no interactivity)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			rest.post(
				"*/registries/docker.io/credentials",
				async (request, response, context) => {
					return response.once(
						context.json({
							password: "jwt",
						})
					);
				}
			)
		);

		await runWrangler(
			"cloudchamber registries credentials docker.io --push --pull"
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		// so testing the actual UI will be harder than expected
		// TODO: think better on how to test UI actions
		expect(std.out).toMatchInlineSnapshot(`"jwt"`);
	});
});
