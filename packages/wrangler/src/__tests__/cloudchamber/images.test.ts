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
			  wrangler cloudchamber registries remove [domain]       removes the registry at the given domain
			  wrangler cloudchamber registries list                  list registries configured for this account

			GLOBAL FLAGS
			  -c, --config   Path to Wrangler configuration file  [string]
			  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]

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

	it("should remove an image registry (no interactivity)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.delete(
				"*/registries/:domain",
				async ({ params }) => {
					const domain = String(params["domain"]);
					expect(domain === "docker.io");
					return HttpResponse.json({});
				},
				{ once: true }
			)
		);
		await runWrangler("cloudchamber registries remove docker.io");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`"{}"`);
	});

	it("should list registries (no interactivity)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get(
				"*/registries",
				async () => {
					return HttpResponse.json([
						{
							public_key: "",
							domain: "docker.io",
						},
						{
							public_key: "some_public_key",
							domain: "docker.io2",
						},
					]);
				},
				{ once: true }
			)
		);
		await runWrangler("cloudchamber registries list");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"[
			    {
			        \\"public_key\\": \\"\\",
			        \\"domain\\": \\"docker.io\\"
			    },
			    {
			        \\"public_key\\": \\"some_public_key\\",
			        \\"domain\\": \\"docker.io2\\"
			    }
			]"
		`);
	});
});
