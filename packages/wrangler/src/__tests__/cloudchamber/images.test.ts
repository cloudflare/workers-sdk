import { http, HttpResponse } from "msw";
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

			Configure registries via Cloudchamber

			COMMANDS
			  wrangler cloudchamber registries configure             Configure Cloudchamber to pull from specific registries
			  wrangler cloudchamber registries credentials [domain]  get a temporary password for a specific domain

			GLOBAL FLAGS
			  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]

			OPTIONS
			      --json  Return output as clean JSON  [boolean] [default: false]"
		`);
	});

	it("should create an image registry (no interactivity)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.post(
				"*/registries",
				async ({ request }) => {
					expect(await request.json()).toEqual({
						domain: "docker.io",
						is_public: false,
					});
					return HttpResponse.json({
						domain: "docker.io",
					});
				},
				{ once: true }
			)
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
			http.post(
				"*/registries/docker.io/credentials",
				async () => {
					return HttpResponse.json({
						password: "jwt",
					});
				},
				{ once: true }
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
