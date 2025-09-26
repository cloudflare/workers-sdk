import * as fs from "node:fs";
import module from "node:module";
import getPort from "get-port";
import { http, HttpResponse } from "msw";
import dedent from "ts-dedent";
import { vi } from "vitest";
import { ConfigController } from "../api/startDevWorker/ConfigController";
import { unwrapHook } from "../api/startDevWorker/utils";
import { getWorkerAccountAndContext } from "../dev/remote";
import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "../environment-variables/misc-variables";
import { FatalError } from "../errors";
import { CI } from "../is-ci";
import { logger } from "../logger";
import { sniffUserAgent } from "../package-manager";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import {
	msw,
	mswSuccessOauthHandlers,
	mswSuccessUserHandlers,
	mswZoneHandlers,
} from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWranglerConfig } from "./helpers/write-wrangler-config";
import type {
	Binding,
	StartDevWorkerInput,
	StartDevWorkerOptions,
	Trigger,
} from "../api";
import type { Mock, MockInstance } from "vitest";

vi.mock("../api/startDevWorker/ConfigController", (importOriginal) =>
	importOriginal()
);
vi.mock("node:child_process");
vi.mock("../dev/hotkeys");

vi.mock("@cloudflare/containers-shared", async (importOriginal) => {
	return {
		...(await importOriginal()),
		isDockerfile: () => true,
	};
});

// Don't memoize in tests. If we did, it would memoize across test runs, which causes problems
vi.mock("../utils/memoizeGetPort", () => {
	return {
		memoizeGetPort: (port: number, host: string) => async () => {
			return await getPort({ port: port, host: host });
		},
	};
});

async function expectedHostAndZone(
	config: StartDevWorkerOptions & { input: StartDevWorkerInput },
	host: string,
	zone: string
): Promise<unknown> {
	expect(config).toMatchObject({
		dev: { origin: { hostname: host } },
	});

	const ctx = await getWorkerAccountAndContext({
		accountId: "",
		complianceConfig: COMPLIANCE_REGION_CONFIG_UNKNOWN,
		host: config.input.dev?.origin?.hostname,
		routes: config.triggers
			?.filter(
				(trigger): trigger is Extract<Trigger, { type: "route" }> =>
					trigger.type === "route"
			)
			.map((trigger) => {
				const { type: _, ...route } = trigger;
				if (
					"custom_domain" in route ||
					"zone_id" in route ||
					"zone_name" in route
				) {
					return route;
				} else {
					return route.pattern;
				}
			}),
		env: undefined,
		legacyEnv: undefined,
		sendMetrics: undefined,
		configPath: config.config,
	});

	expect(ctx).toMatchObject({
		workerContext: {
			host,
			zone,
			routes: config.triggers
				?.filter(
					(trigger): trigger is Extract<Trigger, { type: "route" }> =>
						trigger.type === "route"
				)
				.map((trigger) => {
					const { type: _, ...route } = trigger;
					if (
						"custom_domain" in route ||
						"zone_id" in route ||
						"zone_name" in route
					) {
						return route;
					} else {
						return route.pattern;
					}
				}),
		},
	});

	return config;
}

describe.sequential("wrangler dev", () => {
	let spy: MockInstance;
	let setSpy: MockInstance;
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		setIsTTY(true);
		setSpy = vi.spyOn(ConfigController.prototype, "set");
		spy = vi
			.spyOn(ConfigController.prototype, "emitConfigUpdateEvent")
			.mockImplementation(() => {
				// In unit tests of `wrangler dev` we only care about the first config parse event, so exit early
				throw new FatalError("Bailing early in tests");
			});
		msw.use(
			...mswZoneHandlers,
			...mswSuccessOauthHandlers,
			...mswSuccessUserHandlers
		);
	});

	runInTempDir();
	mockAccountId();
	mockApiToken();
	const std = mockConsoleMethods();
	afterEach(() => {
		msw.resetHandlers();
	});

	async function runWranglerUntilConfig(
		cmd?: string,
		env?: Record<string, string | undefined>
	): Promise<StartDevWorkerOptions & { input: StartDevWorkerInput }> {
		try {
			await runWrangler(cmd, env);
		} catch (e) {
			console.error(e);
		}
		if (spy.mock.calls.length === 0) {
			throw new Error(
				"Config was never reached:\n" + JSON.stringify(std, null, 2)
			);
		}
		return { ...spy.mock.calls[0][0], input: setSpy.mock.calls[0][0] };
	}

	describe("config file support", () => {
		it("should support wrangler.toml", async () => {
			writeWranglerConfig({
				name: "test-worker-toml",
				main: "index.js",
				compatibility_date: "2024-01-01",
			});
			fs.writeFileSync("index.js", `export default {};`);

			const options = await runWranglerUntilConfig("dev");
			expect(options.name).toMatchInlineSnapshot(`"test-worker-toml"`);
		});

		it("should support wrangler.json", async () => {
			writeWranglerConfig(
				{
					name: "test-worker-json",
					main: "index.js",
					compatibility_date: "2024-01-01",
				},
				"wrangler.json"
			);
			fs.writeFileSync("index.js", `export default {};`);

			const options = await runWranglerUntilConfig("dev");
			expect(options.name).toMatchInlineSnapshot(`"test-worker-json"`);
		});

		it("should support wrangler.jsonc", async () => {
			writeWranglerConfig(
				{
					name: "test-worker-jsonc",
					main: "index.js",
					compatibility_date: "2024-01-01",
				},
				"wrangler.jsonc"
			);
			fs.writeFileSync("index.js", `export default {};`);

			const options = await runWranglerUntilConfig("dev");
			expect(options.name).toMatchInlineSnapshot(`"test-worker-jsonc"`);
		});
	});

	describe("authorization without env var", () => {
		mockApiToken({ apiToken: null });
		const isCISpy = vi.spyOn(CI, "isCI").mockReturnValue(true);
		afterEach(() => {
			isCISpy.mockClear();
		});

		it("should kick you to the login flow when running wrangler dev in remote mode without authorization", async () => {
			fs.writeFileSync("index.js", `export default {};`);
			await expect(
				runWrangler("dev --remote index.js")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: You must be logged in to use wrangler dev in remote mode. Try logging in, or run wrangler dev --local.]`
			);
		});
	});
	describe("authorization with env var", () => {
		it("should use config.account_id over env var", async () => {
			writeWranglerConfig({
				name: "test-worker-toml",
				main: "index.js",
				compatibility_date: "2024-01-01",
				account_id: "12345",
			});
			fs.writeFileSync("index.js", `export default {};`);

			const options = await runWranglerUntilConfig("dev");

			await expect(unwrapHook(options.dev.auth)).resolves.toMatchObject({
				accountId: "12345",
			});
		});

		it("should use env var when config.account_id is not set", async () => {
			writeWranglerConfig({
				name: "test-worker-toml",
				main: "index.js",
				compatibility_date: "2024-01-01",
			});
			fs.writeFileSync("index.js", `export default {};`);

			const options = await runWranglerUntilConfig("dev");

			await expect(unwrapHook(options.dev.auth)).resolves.toMatchObject({
				accountId: "some-account-id",
			});
		});
	});

	describe("compatibility-date", () => {
		it("should not warn if there is no wrangler.toml and no compatibility-date specified", async () => {
			fs.writeFileSync("index.js", `export default {};`);
			await runWranglerUntilConfig("dev index.js");
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should warn if there is a wrangler.toml but no compatibility-date", async () => {
			writeWranglerConfig({
				main: "index.js",
				compatibility_date: undefined,
			});
			fs.writeFileSync("index.js", `export default {};`);
			await runWranglerUntilConfig("dev");

			const miniflareEntry = require.resolve("miniflare");
			const miniflareRequire = module.createRequire(miniflareEntry);
			const miniflareWorkerd = miniflareRequire("workerd") as {
				compatibilityDate: string;
			};
			const currentDate = miniflareWorkerd.compatibilityDate;

			expect(std.warn.replaceAll(currentDate, "<current-date>"))
				.toMatchInlineSnapshot(`
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mNo compatibility_date was specified. Using the installed Workers runtime's latest supported date: <current-date>.[0m

					  ❯❯ Add one to your wrangler.toml file: compatibility_date = \\"<current-date>\\", or
					  ❯❯ Pass it in your terminal: wrangler dev [<SCRIPT>] --compatibility-date=<current-date>

					  See [4mhttps://developers.cloudflare.com/workers/platform/compatibility-dates/[0m for more information.

					"
				`);
		});

		it("should not warn if there is a wrangler.toml but compatibility-date is specified at the command line", async () => {
			writeWranglerConfig({
				main: "index.js",
				compatibility_date: undefined,
			});
			fs.writeFileSync("index.js", `export default {};`);
			await runWranglerUntilConfig("dev --compatibility-date=2020-01-01");
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});
	});

	describe("entry-points", () => {
		it("should error if there is no entry-point specified", async () => {
			vi.mocked(sniffUserAgent).mockReturnValue("npm");
			writeWranglerConfig();

			await expect(
				runWrangler("dev")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`
				[Error: Missing entry-point to Worker script or to assets directory

				If there is code to deploy, you can either:
				- Specify an entry-point to your Worker script via the command line (ex: \`npx wrangler dev src/index.ts\`)
				- Or add the following to your "wrangler.toml" file:

				\`\`\`
				main = "src/index.ts"

				\`\`\`


				If are uploading a directory of assets, you can either:
				- Specify the path to the directory of assets via the command line: (ex: \`npx wrangler dev --assets=./dist\`)
				- Or add the following to your "wrangler.toml" file:

				\`\`\`
				[assets]
				directory = "./dist"

				\`\`\`
				]
			`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mMissing entry-point to Worker script or to assets directory[0m


				  If there is code to deploy, you can either:
				  - Specify an entry-point to your Worker script via the command line (ex: \`npx wrangler dev
				  src/index.ts\`)
				  - Or add the following to your \\"wrangler.toml\\" file:

				  \`\`\`
				  main = \\"src/index.ts\\"

				  \`\`\`


				  If are uploading a directory of assets, you can either:
				  - Specify the path to the directory of assets via the command line: (ex: \`npx wrangler dev
				  --assets=./dist\`)
				  - Or add the following to your \\"wrangler.toml\\" file:

				  \`\`\`
				  [assets]
				  directory = \\"./dist\\"

				  \`\`\`


				"
			`);
		});

		it("should use `main` from the top-level environment", async () => {
			writeWranglerConfig({
				main: "index.js",
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev");
			expect(config.entrypoint).toMatch(/index\.js$/);
		});

		it("should use `main` from a named environment", async () => {
			writeWranglerConfig({
				env: {
					ENV1: {
						main: "index.js",
					},
				},
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev --env=ENV1");
			expect(config.entrypoint).toMatch(/index\.js$/);
		});

		it("should use `main` from a named environment, rather than the top-level", async () => {
			writeWranglerConfig({
				main: "other.js",
				env: {
					ENV1: {
						main: "index.js",
					},
				},
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev --env=ENV1");
			expect(config.entrypoint).toMatch(/index\.js$/);
		});
	});

	describe("routes", () => {
		it("should pass routes to emitConfigUpdate", async () => {
			fs.writeFileSync("index.js", `export default {};`);

			// config.routes
			mockGetZones("5.some-host.com", [{ id: "some-zone-id-5" }]);
			writeWranglerConfig({
				main: "index.js",
				routes: ["http://5.some-host.com/some/path/*"],
			});
			const config = await runWranglerUntilConfig("dev --remote");

			const devConfig = await expectedHostAndZone(
				config,
				"5.some-host.com",
				"some-zone-id-5"
			);

			expect(devConfig).toMatchObject({
				triggers: [
					{
						pattern: "http://5.some-host.com/some/path/*",
					},
				],
			});
		});

		it("should error if custom domains with paths are passed in but allow paths on normal routes", async () => {
			fs.writeFileSync("index.js", `export default {};`);
			writeWranglerConfig({
				main: "index.js",
				routes: [
					"simple.co.uk/path",
					"simple.co.uk/*",
					"simple.co.uk",
					{ pattern: "route.co.uk/path", zone_id: "asdfadsf" },
					{ pattern: "route.co.uk/*", zone_id: "asdfadsf" },
					{ pattern: "route.co.uk", zone_id: "asdfadsf" },
					{ pattern: "custom.co.uk/path", custom_domain: true },
					{ pattern: "custom.co.uk/*", custom_domain: true },
					{ pattern: "custom.co.uk", custom_domain: true },
				],
			});
			await expect(runWrangler(`dev`)).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: Invalid Routes:
				custom.co.uk/path:
				Paths are not allowed in Custom Domains

				custom.co.uk/*:
				Wildcard operators (*) are not allowed in Custom Domains
				Paths are not allowed in Custom Domains]
			`);
		});

		it("should warn on mounted paths in dev", async () => {
			writeWranglerConfig({
				routes: [
					"simple.co.uk/path/*",
					"simple.co.uk/*",
					"*/*",
					"*/blog/*",
					{ pattern: "example.com/blog/*", zone_id: "asdfadsf" },
					{ pattern: "example.com/*", zone_id: "asdfadsf" },
					{ pattern: "example.com/abc/def/*", zone_id: "asdfadsf" },
				],
			});

			fs.mkdirSync("assets");

			await runWranglerUntilConfig("dev --assets assets");

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mWarning: The following routes will attempt to serve Assets on a configured path:[0m

				    • simple.co.uk/path/* (Will match assets: assets/path/*)
				    • */blog/* (Will match assets: assets/blog/*)
				    • example.com/blog/* (Will match assets: assets/blog/*)
				    • example.com/abc/def/* (Will match assets: assets/abc/def/*)

				"
			`);
		});
	});

	describe("host", () => {
		it("should resolve a host to its zone", async () => {
			writeWranglerConfig({
				main: "index.js",
			});
			fs.writeFileSync("index.js", `export default {};`);
			mockGetZones("some-host.com", [{ id: "some-zone-id" }]);
			const config = await runWranglerUntilConfig(
				"dev --remote --host some-host.com"
			);

			await expectedHostAndZone(config, "some-host.com", "some-zone-id");
		});

		it("should read wrangler.toml's dev.host", async () => {
			writeWranglerConfig({
				main: "index.js",
				dev: {
					host: "some-host.com",
				},
			});
			fs.writeFileSync("index.js", `export default {};`);
			mockGetZones("some-host.com", [{ id: "some-zone-id" }]);
			const config = await runWranglerUntilConfig("dev");
			expect(config.dev.origin?.hostname).toEqual("some-host.com");
		});

		it("should read --route", async () => {
			writeWranglerConfig({
				main: "index.js",
			});
			fs.writeFileSync("index.js", `export default {};`);
			mockGetZones("some-host.com", [{ id: "some-zone-id" }]);
			const config = await runWranglerUntilConfig(
				"dev --route http://some-host.com/some/path/*"
			);
			await expectedHostAndZone(config, "some-host.com", "some-zone-id");
		});

		it("should read wrangler.toml's routes", async () => {
			writeWranglerConfig({
				main: "index.js",
				routes: [
					"http://some-host.com/some/path/*",
					"http://some-other-host.com/path/*",
				],
			});
			fs.writeFileSync("index.js", `export default {};`);
			mockGetZones("some-host.com", [{ id: "some-zone-id" }]);
			const config = await runWranglerUntilConfig("dev");
			await expectedHostAndZone(config, "some-host.com", "some-zone-id");
		});

		it("should read wrangler.toml's environment specific routes", async () => {
			writeWranglerConfig({
				main: "index.js",
				routes: [
					"http://a-host.com/some/path/*",
					"http://another-host.com/path/*",
				],
				env: {
					staging: {
						routes: [
							"http://some-host.com/some/path/*",
							"http://some-other-host.com/path/*",
						],
					},
				},
			});
			fs.writeFileSync("index.js", `export default {};`);
			mockGetZones("some-host.com", [{ id: "some-zone-id" }]);
			const config = await runWranglerUntilConfig("dev --env staging");
			await expectedHostAndZone(config, "some-host.com", "some-zone-id");
		});

		it("should strip leading `*` from given host when deducing a zone id", async () => {
			writeWranglerConfig({
				main: "index.js",
				route: "*some-host.com/some/path/*",
			});
			fs.writeFileSync("index.js", `export default {};`);
			mockGetZones("some-host.com", [{ id: "some-zone-id" }]);
			const config = await runWranglerUntilConfig("dev");
			await expectedHostAndZone(config, "some-host.com", "some-zone-id");
		});

		it("should strip leading `*.` from given host when deducing a zone id", async () => {
			writeWranglerConfig({
				main: "index.js",
				route: "*.some-host.com/some/path/*",
			});
			fs.writeFileSync("index.js", `export default {};`);
			mockGetZones("some-host.com", [{ id: "some-zone-id" }]);
			const config = await runWranglerUntilConfig("dev");
			await expectedHostAndZone(config, "some-host.com", "some-zone-id");
		});

		it("should, when provided, use a configured zone_id", async () => {
			writeWranglerConfig({
				main: "index.js",
				routes: [
					{ pattern: "https://some-domain.com/*", zone_id: "some-zone-id" },
				],
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev --remote");

			await expectedHostAndZone(config, "some-domain.com", "some-zone-id");
		});

		it("should, when provided, use a zone_name to get a zone_id", async () => {
			writeWranglerConfig({
				main: "index.js",
				routes: [
					{
						pattern: "https://some-zone.com/*",
						zone_name: "some-zone.com",
					},
				],
			});
			fs.writeFileSync("index.js", `export default {};`);
			mockGetZones("some-zone.com", [{ id: "a-zone-id" }]);
			const config = await runWranglerUntilConfig("dev --remote");

			await expectedHostAndZone(config, "some-zone.com", "a-zone-id");
		});

		it("should find the host from the given pattern, not zone_name", async () => {
			writeWranglerConfig({
				main: "index.js",
				routes: [
					{
						pattern: "https://subdomain.exists.com/*",
						zone_name: "does-not-exist.com",
					},
				],
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev");

			expect(config.dev.origin?.hostname).toBe("subdomain.exists.com");
		});

		it("should fail for non-existing zones, when falling back from */*", async () => {
			writeWranglerConfig({
				main: "index.js",
				routes: [
					{
						pattern: "*/*",
						zone_name: "does-not-exist.com",
					},
				],
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			await expect(runWrangler("dev --remote")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: Could not find zone for \`does-not-exist.com\`. Make sure the domain is set up to be proxied by Cloudflare.
				For more details, refer to https://developers.cloudflare.com/workers/configuration/routing/routes/#set-up-a-route]
			`);
		});

		it("should fallback to zone_name when given the pattern */*", async () => {
			writeWranglerConfig({
				main: "index.js",
				routes: [
					{
						pattern: "*/*",
						zone_name: "exists.com",
					},
				],
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev");

			expect(config.triggers).toMatchObject([
				{
					zone_name: "exists.com",
				},
			]);
		});
		it("fails when given the pattern */* and no zone_name", async () => {
			writeWranglerConfig({
				main: "index.js",
				routes: [
					{
						pattern: "*/*",
						zone_id: "exists-com",
					},
				],
			});
			await fs.promises.writeFile("index.js", `export default {};`);

			await expect(runWrangler("dev")).rejects.toMatchInlineSnapshot(`
				[Error: Cannot infer host from first route: {"pattern":"*/*","zone_id":"exists-com"}.
				You can explicitly set the \`dev.host\` configuration in your wrangler.toml file, for example:

					\`\`\`
					[dev]
				host = "example.com"

					\`\`\`
				]
			`);
		});

		it("given a long host, it should use the longest subdomain that resolves to a zone", async () => {
			writeWranglerConfig({
				main: "index.js",
			});
			fs.writeFileSync("index.js", `export default {};`);

			msw.use(
				http.get("*/zones", ({ request }) => {
					const url = new URL(request.url);
					let zone: [] | [{ id: "some-zone-id" }] = [];
					if (url.searchParams.get("name") === "111.222.333.some-host.com") {
						zone = [];
					} else if (url.searchParams.get("name") === "222.333.some-host.com") {
						zone = [];
					} else if (url.searchParams.get("name") === "333.some-host.com") {
						zone = [{ id: "some-zone-id" }];
					}

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: zone,
						},
						{ status: 200 }
					);
				})
			);

			const config = await runWranglerUntilConfig(
				"dev --remote --host 111.222.333.some-host.com"
			);

			await expectedHostAndZone(
				config,
				"111.222.333.some-host.com",
				"some-zone-id"
			);
		});

		describe("should, in order, use args.host/config.dev.host/args.routes/(config.route|config.routes)", () => {
			it("config.routes", async () => {
				fs.writeFileSync("index.js", `export default {};`);

				mockGetZones("5.some-host.com", [{ id: "some-zone-id-5" }]);
				writeWranglerConfig({
					main: "index.js",
					routes: ["http://5.some-host.com/some/path/*"],
				});
				const config = await runWranglerUntilConfig("dev --remote");

				await expectedHostAndZone(config, "5.some-host.com", "some-zone-id-5");
			});
			it("config.route", async () => {
				fs.writeFileSync("index.js", `export default {};`);

				mockGetZones("4.some-host.com", [{ id: "some-zone-id-4" }]);
				writeWranglerConfig({
					main: "index.js",
					route: "https://4.some-host.com/some/path/*",
				});
				const config2 = await runWranglerUntilConfig("dev --remote");

				await expectedHostAndZone(config2, "4.some-host.com", "some-zone-id-4");
			});
			it("--routes", async () => {
				fs.writeFileSync("index.js", `export default {};`);

				mockGetZones("3.some-host.com", [{ id: "some-zone-id-3" }]);
				writeWranglerConfig({
					main: "index.js",
					route: "https://4.some-host.com/some/path/*",
				});
				const config3 = await runWranglerUntilConfig(
					"dev --remote --routes http://3.some-host.com/some/path/*"
				);

				await expectedHostAndZone(config3, "3.some-host.com", "some-zone-id-3");
			});
			it("config.dev.host", async () => {
				fs.writeFileSync("index.js", `export default {};`);

				mockGetZones("2.some-host.com", [{ id: "some-zone-id-2" }]);
				writeWranglerConfig({
					main: "index.js",
					dev: {
						host: `2.some-host.com`,
					},
					route: "4.some-host.com/some/path/*",
				});
				const config4 = await runWranglerUntilConfig(
					"dev --remote --routes http://3.some-host.com/some/path/*"
				);
				expect(config4.dev.origin?.hostname).toBe("2.some-host.com");
			});
			it("host", async () => {
				fs.writeFileSync("index.js", `export default {};`);

				mockGetZones("1.some-host.com", [{ id: "some-zone-id-1" }]);
				writeWranglerConfig({
					main: "index.js",
					dev: {
						host: `2.some-host.com`,
					},
					route: "4.some-host.com/some/path/*",
				});
				const config5 = await runWranglerUntilConfig(
					"dev --remote --routes http://3.some-host.com/some/path/* --host 1.some-host.com"
				);
				await expectedHostAndZone(config5, "1.some-host.com", "some-zone-id-1");
			});
		});
		it("should error if a host can't resolve to a zone", async () => {
			writeWranglerConfig({
				main: "index.js",
			});
			fs.writeFileSync("index.js", `export default {};`);
			mockGetZones("some-host.com", []);
			await expect(runWrangler("dev --remote --host some-host.com")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: Could not find zone for \`some-host.com\`. Make sure the domain is set up to be proxied by Cloudflare.
				For more details, refer to https://developers.cloudflare.com/workers/configuration/routing/routes/#set-up-a-route]
			`);
		});

		it("should not try to resolve a zone when starting in local mode", async () => {
			writeWranglerConfig({
				main: "index.js",
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev --host some-host.com");
			// This is testing the _lack_ of the error in the test above: https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler/src/__tests__/dev.test.tsx#L725-L726
			expect(config.dev.origin?.hostname).toBe("some-host.com");
		});
	});

	describe("local upstream", () => {
		it("should use dev.host from toml by default", async () => {
			writeWranglerConfig({
				main: "index.js",
				dev: {
					host: `2.some-host.com`,
				},
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev");
			expect(config.dev.origin?.hostname).toEqual("2.some-host.com");
		});

		it("should use route from toml by default", async () => {
			writeWranglerConfig({
				main: "index.js",
				route: "https://4.some-host.com/some/path/*",
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev");
			expect(config.dev.origin?.hostname).toEqual("4.some-host.com");
		});

		it("should respect the option when provided", async () => {
			writeWranglerConfig({
				main: "index.js",
				route: `2.some-host.com`,
			});
			fs.writeFileSync("index.js", `export default {};`);

			const config = await runWranglerUntilConfig(
				"dev --local-upstream some-host.com"
			);
			expect(config.dev.origin?.hostname).toEqual("some-host.com");
		});
	});

	describe("custom builds", () => {
		it("should run a custom build before starting `dev`", async () => {
			writeWranglerConfig({
				build: {
					command: `node -e "4+4; require('fs').writeFileSync('index.js', 'export default { fetch(){ return new Response(123) } }')"`,
				},
			});

			const config = await runWranglerUntilConfig("dev index.js");

			expect(fs.readFileSync("index.js", "utf-8")).toMatchInlineSnapshot(
				`"export default { fetch(){ return new Response(123) } }"`
			);

			// and the command would pass through
			expect(config.build.custom).toEqual({
				command:
					"node -e \"4+4; require('fs').writeFileSync('index.js', 'export default { fetch(){ return new Response(123) } }')\"",
				workingDirectory: undefined,
				watch: "src",
			});
			expect(std.out).toMatchInlineSnapshot(
				`
				"[custom build] Running: node -e \\"4+4; require('fs').writeFileSync('index.js', 'export default { fetch(){ return new Response(123) } }')\\"
				"
			`
			);
		});

		it.skipIf(process.platform === "win32")(
			"should run a custom build of multiple steps combined by && before starting `dev`",
			async () => {
				writeWranglerConfig({
					build: {
						command: `echo "export default { fetch(){ return new Response(123) } }" > index.js`,
					},
				});

				await runWranglerUntilConfig("dev index.js");

				expect(fs.readFileSync("index.js", "utf-8")).toMatchInlineSnapshot(`
			          "export default { fetch(){ return new Response(123) } }
			          "
		        `);

				expect(std.out).toMatchInlineSnapshot(
					`
					"[custom build] Running: echo \\"export default { fetch(){ return new Response(123) } }\\" > index.js
					"
				`
				);
			}
		);

		it("should throw an error if the entry doesn't exist after the build finishes", async () => {
			writeWranglerConfig({
				main: "index.js",
				build: {
					command: `node -e "4+4;"`,
				},
			});

			await expect(runWrangler("dev")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: The expected output file at "index.js" was not found after running custom build: node -e "4+4;".
				The \`main\` property in your wrangler.toml file should point to the file generated by the custom build.]
			`);
			expect(std.out).toMatchInlineSnapshot(`
				"[custom build] Running: node -e \\"4+4;\\"
				"
			`);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mThe expected output file at \\"index.js\\" was not found after running custom build: node -e \\"4+4;\\".[0m

				  The \`main\` property in your wrangler.toml file should point to the file generated by the custom
				  build.

				"
			`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		describe(".env", () => {
			const processEnv = process.env;
			beforeEach(() => (process.env = { ...processEnv }));
			afterEach(() => (process.env = processEnv));

			beforeEach(() => {
				fs.writeFileSync(
					".env",
					dedent`
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_1=default-1
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_2=default-2
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_3=default-3
					`
				);
				fs.writeFileSync(
					".env.local",
					dedent`
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_1=default-local-1
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_LOCAL=default-local
					`
				);
				fs.writeFileSync(
					".env.custom",
					dedent`
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_2=custom-2
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_3=custom-3
					`
				);
				fs.writeFileSync(
					".env.custom.local",
					dedent`
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_1=custom-local-1
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_3=custom-local-3
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_LOCAL=custom-local
					`
				);
				fs.writeFileSync(
					"build.js",
					dedent`
						const customFields = Object.entries(process.env).filter(([key]) => key.startsWith('__DOT_ENV_TEST_CUSTOM_BUILD_VAR'));
						console.log(customFields.map(([key, value]) => key + "=" + value).join('\\n'));
					`
				);
				fs.writeFileSync("index.js", `export default {};`);
				writeWranglerConfig({
					main: "index.js",
					env: { custom: {}, noEnv: {} },
					build: { command: `node ./build.js` },
				});
			});

			function extractCustomBuildLogs(stdout: string) {
				return stdout
					.split("\n")
					.filter((line) => line.startsWith("[custom build]"))
					.map((line) => line.replace(/\[custom build\]( |$)/, ""))
					.sort()
					.join("\n");
			}

			it("should pass environment variables from `.env` to custom builds", async () => {
				await runWranglerUntilConfig("dev");
				expect(extractCustomBuildLogs(std.out)).toMatchInlineSnapshot(`
					"
					Running: node ./build.js
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_1=default-local-1
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_2=default-2
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_3=default-3
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_LOCAL=default-local"
				`);
			});

			it("should prefer to load environment variables from `.env.<environment>` if `--env <environment>` is set", async () => {
				await runWranglerUntilConfig("dev --env custom");
				expect(extractCustomBuildLogs(std.out)).toMatchInlineSnapshot(`
					"
					Running: node ./build.js
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_1=custom-local-1
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_2=custom-2
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_3=custom-local-3
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_LOCAL=custom-local"
				`);
			});

			it("should use default `.env` if `.env.<environment>` does not exist", async () => {
				await runWranglerUntilConfig("dev --env=noEnv");
				expect(extractCustomBuildLogs(std.out)).toMatchInlineSnapshot(`
					"
					Running: node ./build.js
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_1=default-local-1
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_2=default-2
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_3=default-3
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_LOCAL=default-local"
				`);
			});

			it("should not override environment variables already on process.env", async () => {
				vi.stubEnv("__DOT_ENV_TEST_CUSTOM_BUILD_VAR_1", "process-env");
				await runWranglerUntilConfig("dev");
				expect(extractCustomBuildLogs(std.out)).toMatchInlineSnapshot(`
					"
					Running: node ./build.js
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_1=process-env
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_2=default-2
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_3=default-3
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_LOCAL=default-local"
				`);
			});

			it("should prefer to load environment variables from a custom path `.env` if `--env-file` is set", async () => {
				fs.mkdirSync("other", { recursive: true });
				fs.writeFileSync(
					"other/.env",
					dedent`
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_2=other-2
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_3=other-3
					`
				);

				// This file will not be loaded because `--env-file` is set for it.
				fs.writeFileSync(
					"other/.env.local",
					dedent`
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_1=other-local-1
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_3=other-local-3
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_LOCAL=other-local
					`
				);

				await runWranglerUntilConfig("dev --env-file other/.env");
				expect(extractCustomBuildLogs(std.out)).toMatchInlineSnapshot(`
					"
					Running: node ./build.js
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_2=other-2
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_3=other-3"
				`);
			});

			it("should prefer to load environment variables from a custom path `.env` if multiple `--env-file` is set", async () => {
				fs.mkdirSync("other", { recursive: true });
				fs.writeFileSync(
					"other/.env",
					dedent`
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_2=other-2
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_3=other-3
					`
				);
				fs.writeFileSync(
					"other/.env.local",
					dedent`
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_1=other-local-1
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_3=other-local-3
						__DOT_ENV_TEST_CUSTOM_BUILD_VAR_LOCAL=other-local
					`
				);

				await runWranglerUntilConfig(
					"dev --env-file other/.env --env-file other/.env.local"
				);
				expect(extractCustomBuildLogs(std.out)).toMatchInlineSnapshot(`
					"
					Running: node ./build.js
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_1=other-local-1
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_2=other-2
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_3=other-local-3
					__DOT_ENV_TEST_CUSTOM_BUILD_VAR_LOCAL=other-local"
				`);
			});
		});
	});

	describe("upstream-protocol", () => {
		it("should default upstream-protocol to `https` if remote mode", async () => {
			writeWranglerConfig({
				main: "index.js",
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev --remote");
			expect(config.dev.origin?.secure).toEqual(true);
		});

		it("should warn if `--upstream-protocol=http` is used in remote mode", async () => {
			writeWranglerConfig({
				main: "index.js",
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig(
				"dev --upstream-protocol=http --remote"
			);
			expect(config.dev.origin?.secure).toEqual(false);
			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mSetting upstream-protocol to http is not currently supported for remote mode.[0m

			  If this is required in your project, please add your use case to the following issue:
			  [4mhttps://github.com/cloudflare/workers-sdk/issues/583[0m.

			"
		`);
		});

		it("should default upstream-protocol to local-protocol if local mode", async () => {
			writeWranglerConfig({
				main: "index.js",
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev --local-protocol=https");
			expect(config.dev.origin?.secure).toEqual(true);
		});

		it("should default upstream-protocol to http if no local-protocol in local mode", async () => {
			writeWranglerConfig({
				main: "index.js",
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev");
			expect(config.dev.origin?.secure).toEqual(false);
		});
	});

	describe("local-protocol", () => {
		it("should default local-protocol to `http`", async () => {
			writeWranglerConfig({
				main: "index.js",
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev");
			expect(config.dev.server?.secure).toEqual(false);
		});

		it("should use `local_protocol` from `wrangler.toml`, if available", async () => {
			writeWranglerConfig({
				main: "index.js",
				dev: {
					local_protocol: "https",
				},
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev");
			expect(config.dev.server?.secure).toEqual(true);
		});

		it("should use --local-protocol command line arg, if provided", async () => {
			// Here we show that the command line overrides the wrangler.toml by
			// setting the config to https, and then setting it back to http on the command line.
			writeWranglerConfig({
				main: "index.js",
				dev: {
					local_protocol: "https",
				},
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev --local-protocol=http");
			expect(config.dev.server?.secure).toEqual(false);
		});
	});

	describe("ip", () => {
		it("should default ip to localhost", async () => {
			writeWranglerConfig({
				main: "index.js",
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev");
			expect(config.dev.server?.hostname).toEqual(
				process.platform === "win32" ? "127.0.0.1" : "localhost"
			);
		});

		it("should use to `ip` from `wrangler.toml`, if available", async () => {
			writeWranglerConfig({
				main: "index.js",
				dev: {
					ip: "::1",
				},
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev");
			expect(config.dev.server?.hostname).toEqual("::1");
		});

		it("should use --ip command line arg, if provided", async () => {
			writeWranglerConfig({
				main: "index.js",
				dev: {
					ip: "::1",
				},
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev --ip=127.0.0.1");
			expect(config.dev.server?.hostname).toEqual("127.0.0.1");
		});
	});

	describe("inspector port", () => {
		it("should use 9229 as the default port", async () => {
			(getPort as Mock).mockImplementation((options) => options.port);
			writeWranglerConfig({
				main: "index.js",
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev");
			assert(typeof config.dev.inspector === "object");
			expect(config.dev.inspector?.port).toEqual(9229);
		});

		it("should read --inspector-port", async () => {
			(getPort as Mock).mockImplementation((options) => options.port);
			writeWranglerConfig({
				main: "index.js",
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev --inspector-port=9999");
			assert(typeof config.dev.inspector === "object");
			expect(config.dev.inspector?.port).toEqual(9999);
		});

		it("should read dev.inspector_port from wrangler.toml", async () => {
			writeWranglerConfig({
				main: "index.js",
				dev: {
					inspector_port: 9999,
				},
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev");
			assert(typeof config.dev.inspector === "object");
			expect(config.dev.inspector?.port).toEqual(9999);
		});

		it("should error if a bad dev.inspector_port config is provided", async () => {
			writeWranglerConfig({
				main: "index.js",
				dev: {
					// @ts-expect-error intentionally bad port
					inspector_port: "some string",
				},
			});
			fs.writeFileSync("index.js", `export default {};`);
			await expect(runWrangler("dev")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: Processing wrangler.toml configuration:
				  - Expected "dev.inspector_port" to be of type number but got "some string".]
			`);
		});
	});

	describe("port", () => {
		it("should default port to 8787 if it is not in use", async () => {
			writeWranglerConfig({
				main: "index.js",
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev");
			expect(config.dev.server?.port).toEqual(8787);
		});

		it("should use `port` from `wrangler.toml`, if available", async () => {
			writeWranglerConfig({
				main: "index.js",
				dev: {
					port: 8888,
				},
			});
			fs.writeFileSync("index.js", `export default {};`);
			// Mock `getPort()` to resolve to a completely different port.
			(getPort as Mock).mockResolvedValueOnce(98765);

			const config = await runWranglerUntilConfig("dev");
			expect(config.dev.server?.port).toEqual(8888);
		});

		it("should error if a bad dev.port config is provided", async () => {
			writeWranglerConfig({
				main: "index.js",
				dev: {
					// @ts-expect-error intentionally bad port
					port: "some string",
				},
			});
			fs.writeFileSync("index.js", `export default {};`);
			await expect(runWrangler("dev")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: Processing wrangler.toml configuration:
				  - Expected "dev.port" to be of type number but got "some string".]
			`);
		});

		it("should use --port command line arg, if provided", async () => {
			writeWranglerConfig({
				main: "index.js",
				dev: {
					port: 8888,
				},
			});
			fs.writeFileSync("index.js", `export default {};`);
			// Mock `getPort()` to resolve to a completely different port.
			(getPort as Mock).mockResolvedValueOnce(98766);

			const config = await runWranglerUntilConfig("dev --port=9999");
			expect(config.dev.server?.port).toEqual(9999);
		});

		it("should use a different port to the default if it is in use", async () => {
			writeWranglerConfig({
				main: "index.js",
			});
			fs.writeFileSync("index.js", `export default {};`);
			// Mock `getPort()` to resolve to a completely different port.
			(getPort as Mock).mockResolvedValueOnce(98767);

			const config = await runWranglerUntilConfig("dev");
			expect(config.dev.server?.port).toEqual(98767);
		});
	});

	describe("container engine", () => {
		const minimalContainerConfig = {
			durable_objects: {
				bindings: [
					{
						name: "EXAMPLE_DO_BINDING",
						class_name: "ExampleDurableObject",
					},
				],
			},
			migrations: [{ tag: "v1", new_sqlite_classes: ["ExampleDurableObject"] }],
			containers: [
				{
					name: "my-container",
					max_instances: 10,
					class_name: "ExampleDurableObject",
					image: "docker.io/hello:world",
				},
			],
		};
		let mockExecFileSync: ReturnType<typeof vi.fn>;
		const mockedDockerContextLsOutput = `{"Current":true,"Description":"Current DOCKER_HOST based configuration","DockerEndpoint":"unix:///current/run/docker.sock","Error":"","Name":"default"}
{"Current":false,"Description":"Docker Desktop","DockerEndpoint":"unix:///other/run/docker.sock","Error":"","Name":"desktop-linux"}`;

		beforeEach(async () => {
			const childProcess = await import("node:child_process");
			mockExecFileSync = vi.mocked(childProcess.execFileSync);

			mockExecFileSync.mockReturnValue(mockedDockerContextLsOutput);
		});
		it("should default to socket of current docker context", async () => {
			writeWranglerConfig({
				main: "index.js",
				...minimalContainerConfig,
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev");
			expect(config.dev.containerEngine).toEqual(
				"unix:///current/run/docker.sock"
			);
		});

		it("should be able to be set by config", async () => {
			writeWranglerConfig({
				main: "index.js",
				dev: {
					port: 8888,
					container_engine: "test.sock",
				},
				...minimalContainerConfig,
			});
			fs.writeFileSync("index.js", `export default {};`);

			const config = await runWranglerUntilConfig("dev");
			expect(config.dev.containerEngine).toEqual("test.sock");
		});
		it("should be able to be set by env var", async () => {
			writeWranglerConfig({
				main: "index.js",
				dev: {
					port: 8888,
				},
				...minimalContainerConfig,
			});
			fs.writeFileSync("index.js", `export default {};`);
			vi.stubEnv("WRANGLER_DOCKER_HOST", "blah.sock");

			const config = await runWranglerUntilConfig("dev");
			expect(config.dev.containerEngine).toEqual("blah.sock");
		});
	});

	describe("durable_objects", () => {
		it("should warn if there are remote Durable Objects, or missing migrations for local Durable Objects", async () => {
			writeWranglerConfig({
				main: "index.js",
				durable_objects: {
					bindings: [
						{ name: "NAME_1", class_name: "CLASS_1" },
						{
							name: "NAME_2",
							class_name: "CLASS_2",
							script_name: "SCRIPT_A",
						},
						{ name: "NAME_3", class_name: "CLASS_3" },
						{
							name: "NAME_4",
							class_name: "CLASS_4",
							script_name: "SCRIPT_B",
						},
					],
				},
			});
			fs.writeFileSync("index.js", `export default {};`);
			const config = await runWranglerUntilConfig("dev");
			expect(config.dev.server?.hostname).toEqual(
				process.platform === "win32" ? "127.0.0.1" : "localhost"
			);
			expect(std.out).toMatchInlineSnapshot(`
				"Your Worker has access to the following bindings:
				Binding                                        Resource            Mode
				env.NAME_1 (CLASS_1)                           Durable Object      local
				env.NAME_2 (CLASS_2, defined in SCRIPT_A)      Durable Object      local [not connected]
				env.NAME_3 (CLASS_3)                           Durable Object      local
				env.NAME_4 (CLASS_4, defined in SCRIPT_B)      Durable Object      local [not connected]

				"
			`);
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - In your wrangler.toml file, you have configured \`durable_objects\` exported by this Worker
				  (CLASS_1, CLASS_3), but no \`migrations\` for them. This may not work as expected until you add a
				  \`migrations\` section to your wrangler.toml file. Add the following configuration:

				      \`\`\`
				      [[migrations]]
				      tag = \\"v1\\"
				      new_classes = [ \\"CLASS_1\\", \\"CLASS_3\\" ]

				      \`\`\`

				      Refer to
				  [4mhttps://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/[0m for more
				  details.

				"
			`);
		});
	});

	describe(".dev.vars", () => {
		it("should override `vars` bindings from `wrangler.toml` with values in `.dev.vars`", async () => {
			fs.writeFileSync("index.js", `export default {};`);

			const localVarsEnvContent = dedent`
      # Preceding comment
      VAR_1="var #1 value" # End of line comment
      VAR_3="var #3 value"
      VAR_MULTI_LINE_1="A: line 1
      line 2"
      VAR_MULTI_LINE_2="B: line 1\\nline 2"
      EMPTY=
      UNQUOTED= unquoted value
      `;
			fs.writeFileSync(".dev.vars", localVarsEnvContent, "utf8");

			writeWranglerConfig({
				main: "index.js",
				vars: {
					VAR_1: "original value 1",
					VAR_2: "original value 2", // should not get overridden
					VAR_3: "original value 3",
					VAR_MULTI_LINE_1: "original multi-line 1",
					VAR_MULTI_LINE_2: "original multi-line 2",
					EMPTY: "original empty",
					UNQUOTED: "original unquoted",
				},
			});
			const config = await runWranglerUntilConfig("dev");
			const varBindings: Record<string, unknown> = Object.fromEntries(
				Object.entries(config.bindings ?? {})
					.filter(
						(
							binding
						): binding is [string, Extract<Binding, { type: "plain_text" }>] =>
							binding[1].type === "plain_text"
					)
					.map(([b, v]) => [b, v.value])
			);

			expect(varBindings).toEqual({
				VAR_1: "var #1 value",
				VAR_2: "original value 2",
				VAR_3: "var #3 value",
				VAR_MULTI_LINE_1: "A: line 1\nline 2",
				VAR_MULTI_LINE_2: "B: line 1\nline 2",
				EMPTY: "",
				UNQUOTED: "unquoted value", // Note that whitespace is trimmed
			});
			expect(std.out).toMatchInlineSnapshot(`
				"Using vars defined in .dev.vars
				Your Worker has access to the following bindings:
				Binding                                        Resource                  Mode
				env.VAR_1 (\\"(hidden)\\")                         Environment Variable      local
				env.VAR_2 (\\"original value 2\\")                 Environment Variable      local
				env.VAR_3 (\\"(hidden)\\")                         Environment Variable      local
				env.VAR_MULTI_LINE_1 (\\"(hidden)\\")              Environment Variable      local
				env.VAR_MULTI_LINE_2 (\\"(hidden)\\")              Environment Variable      local
				env.EMPTY (\\"(hidden)\\")                         Environment Variable      local
				env.UNQUOTED (\\"(hidden)\\")                      Environment Variable      local

				"
			`);
		});

		it("should prefer `.dev.vars.<environment>` if `--env <environment> set`", async () => {
			fs.writeFileSync("index.js", `export default {};`);
			fs.writeFileSync(".dev.vars", "DEFAULT_VAR=default");
			fs.writeFileSync(".dev.vars.custom", "CUSTOM_VAR=custom");

			writeWranglerConfig({ main: "index.js", env: { custom: {} } });
			const config = await runWranglerUntilConfig("dev --env custom");
			const varBindings: Record<string, unknown> = Object.fromEntries(
				Object.entries(config.bindings ?? {})
					.filter(
						(
							binding
						): binding is [string, Extract<Binding, { type: "plain_text" }>] =>
							binding[1].type === "plain_text"
					)
					.map(([b, v]) => [b, v.value])
			);

			expect(varBindings).toEqual({ CUSTOM_VAR: "custom" });
			expect(std.out).toMatchInlineSnapshot(`
				"Using vars defined in .dev.vars.custom
				Your Worker has access to the following bindings:
				Binding                          Resource                  Mode
				env.CUSTOM_VAR (\\"(hidden)\\")      Environment Variable      local

				"
			`);
		});
	});

	describe(".env in local dev", () => {
		const processEnv = process.env;
		beforeEach(() => (process.env = { ...processEnv }));
		afterEach(() => (process.env = processEnv));

		beforeEach(() => {
			fs.writeFileSync(
				".env",
				dedent`
						__DOT_ENV_LOCAL_DEV_VAR_1=default-1
						__DOT_ENV_LOCAL_DEV_VAR_2=default-2
						__DOT_ENV_LOCAL_DEV_VAR_3=default-3
					`
			);
			fs.writeFileSync(
				".env.local",
				dedent`
						__DOT_ENV_LOCAL_DEV_VAR_1=default-local-1
						__DOT_ENV_LOCAL_DEV_VAR_LOCAL=default-local
					`
			);
			fs.writeFileSync(
				".env.custom",
				dedent`
						__DOT_ENV_LOCAL_DEV_VAR_2=custom-2
						__DOT_ENV_LOCAL_DEV_VAR_3=custom-3
					`
			);
			fs.writeFileSync(
				".env.custom.local",
				dedent`
						__DOT_ENV_LOCAL_DEV_VAR_1=custom-local-1
						__DOT_ENV_LOCAL_DEV_VAR_3=custom-local-3
						__DOT_ENV_LOCAL_DEV_VAR_LOCAL=custom-local
					`
			);
			fs.writeFileSync("index.js", `export default {};`);
			writeWranglerConfig({
				main: "index.js",
			});
		});

		function extractUsingVars(stdout: string) {
			return stdout
				.split("\n")
				.filter((line) => line.startsWith("Using vars"))
				.sort()
				.join("\n");
		}

		function extractBindings(stdout: string) {
			return stdout
				.split("\n")
				.filter((line) => line.startsWith("env."))
				.sort()
				.join("\n");
		}

		it("should get local dev `vars` from `.env`", async () => {
			await runWranglerUntilConfig("dev");
			expect(extractUsingVars(std.out)).toMatchInlineSnapshot(`
				"Using vars defined in .env
				Using vars defined in .env.local"
			`);
			expect(extractBindings(std.out)).toMatchInlineSnapshot(`
				"env.__DOT_ENV_LOCAL_DEV_VAR_1 (\\"(hidden)\\")          Environment Variable      local
				env.__DOT_ENV_LOCAL_DEV_VAR_2 (\\"(hidden)\\")          Environment Variable      local
				env.__DOT_ENV_LOCAL_DEV_VAR_3 (\\"(hidden)\\")          Environment Variable      local
				env.__DOT_ENV_LOCAL_DEV_VAR_LOCAL (\\"(hidden)\\")      Environment Variable      local"
			`);
		});

		it("should not load local dev `vars` from `.env` if there is a `.dev.vars` file", async () => {
			fs.writeFileSync(
				".dev.vars",
				dedent`
						__DOT_DEV_DOT_VARS_LOCAL_DEV_VAR_1=dot-dev-var-1
						__DOT_DEV_DOT_VARS_LOCAL_DEV_VAR_2=dot-dev-var-2
					`
			);
			await runWranglerUntilConfig("dev");
			expect(extractUsingVars(std.out)).toMatchInlineSnapshot(`
				"Using vars defined in .dev.vars"
			`);
			expect(extractBindings(std.out)).toMatchInlineSnapshot(`
				"env.__DOT_DEV_DOT_VARS_LOCAL_DEV_VAR_1 (\\"(hidden)\\")      Environment Variable      local
				env.__DOT_DEV_DOT_VARS_LOCAL_DEV_VAR_2 (\\"(hidden)\\")      Environment Variable      local"
			`);
		});

		it("should not load local dev `vars` from `.env` if CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV is set to false", async () => {
			await runWranglerUntilConfig("dev", {
				CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
			});
			expect(extractUsingVars(std.out)).toMatchInlineSnapshot(`""`);
			expect(extractBindings(std.out)).toMatchInlineSnapshot(`""`);
		});

		it("should get local dev `vars` from appropriate `.env.<environment>` files when --env=<environment> is set", async () => {
			await runWranglerUntilConfig("dev --env custom");
			expect(extractUsingVars(std.out)).toMatchInlineSnapshot(`
				"Using vars defined in .env
				Using vars defined in .env.custom
				Using vars defined in .env.custom.local
				Using vars defined in .env.local"
			`);
			expect(extractBindings(std.out)).toMatchInlineSnapshot(`
				"env.__DOT_ENV_LOCAL_DEV_VAR_1 (\\"(hidden)\\")          Environment Variable      local
				env.__DOT_ENV_LOCAL_DEV_VAR_2 (\\"(hidden)\\")          Environment Variable      local
				env.__DOT_ENV_LOCAL_DEV_VAR_3 (\\"(hidden)\\")          Environment Variable      local
				env.__DOT_ENV_LOCAL_DEV_VAR_LOCAL (\\"(hidden)\\")      Environment Variable      local"
			`);
		});

		it("should get local dev vars from appropriate `.env` files when --env=<environment> is set but no .env.<environment> file exists", async () => {
			await runWranglerUntilConfig("dev --env noEnv");
			expect(extractUsingVars(std.out)).toMatchInlineSnapshot(`
				"Using vars defined in .env
				Using vars defined in .env.local"
			`);
			expect(extractBindings(std.out)).toMatchInlineSnapshot(`
				"env.__DOT_ENV_LOCAL_DEV_VAR_1 (\\"(hidden)\\")          Environment Variable      local
				env.__DOT_ENV_LOCAL_DEV_VAR_2 (\\"(hidden)\\")          Environment Variable      local
				env.__DOT_ENV_LOCAL_DEV_VAR_3 (\\"(hidden)\\")          Environment Variable      local
				env.__DOT_ENV_LOCAL_DEV_VAR_LOCAL (\\"(hidden)\\")      Environment Variable      local"
			`);
		});

		it("should get local dev `vars` from `process.env` when `CLOUDFLARE_INCLUDE_PROCESS_ENV` is true", async () => {
			await runWranglerUntilConfig("dev --env custom", {
				CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
			});
			expect(extractUsingVars(std.out)).toMatchInlineSnapshot(`
				"Using vars defined in .env
				Using vars defined in .env.custom
				Using vars defined in .env.custom.local
				Using vars defined in .env.local
				Using vars defined in process.env"
			`);
			// We could dump out all the bindings but that would be a lot of noise, and also may change between OSes and runs.
			// Instead, we know that the `CLOUDFLARE_INCLUDE_PROCESS_ENV` variable should be present, so we just check for that.
			expect(extractBindings(std.out)).contains(
				'env.CLOUDFLARE_INCLUDE_PROCESS_ENV ("(hidden)")'
			);
		});

		it("should get local dev `vars` from appropriate `.env.<environment>` files when --env-file is set", async () => {
			fs.mkdirSync("other", { recursive: true });
			fs.writeFileSync(
				"other/.env",
				dedent`
						__DOT_ENV_LOCAL_DEV_VAR_2=custom-2
						__DOT_ENV_LOCAL_DEV_VAR_3=custom-3
					`
			);
			fs.writeFileSync(
				"other/.env.local",
				dedent`
						__DOT_ENV_LOCAL_DEV_VAR_1=custom-local-1
						__DOT_ENV_LOCAL_DEV_VAR_3=custom-local-3
						__DOT_ENV_LOCAL_DEV_VAR_LOCAL=custom-local
					`
			);

			await runWranglerUntilConfig("dev --env-file=other/.env");
			expect(extractUsingVars(std.out)).toMatchInlineSnapshot(
				`"Using vars defined in other/.env"`
			);
			expect(extractBindings(std.out)).toMatchInlineSnapshot(`
				"env.__DOT_ENV_LOCAL_DEV_VAR_2 (\\"(hidden)\\")      Environment Variable      local
				env.__DOT_ENV_LOCAL_DEV_VAR_3 (\\"(hidden)\\")      Environment Variable      local"
			`);
		});

		it("should get local dev `vars` from appropriate `.env.<environment>` files when multiple --env-file options are set", async () => {
			fs.mkdirSync("other", { recursive: true });
			fs.writeFileSync(
				"other/.env",
				dedent`
						__DOT_ENV_LOCAL_DEV_VAR_2=custom-2
						__DOT_ENV_LOCAL_DEV_VAR_3=custom-3
					`
			);
			fs.writeFileSync(
				"other/.env.local",
				dedent`
						__DOT_ENV_LOCAL_DEV_VAR_1=custom-local-1
						__DOT_ENV_LOCAL_DEV_VAR_3=custom-local-3
						__DOT_ENV_LOCAL_DEV_VAR_LOCAL=custom-local
					`
			);

			await runWranglerUntilConfig(
				"dev --env-file=other/.env --env-file=other/.env.local"
			);
			expect(extractUsingVars(std.out)).toMatchInlineSnapshot(`
				"Using vars defined in other/.env
				Using vars defined in other/.env.local"
			`);
			expect(extractBindings(std.out)).toMatchInlineSnapshot(`
				"env.__DOT_ENV_LOCAL_DEV_VAR_1 (\\"(hidden)\\")          Environment Variable      local
				env.__DOT_ENV_LOCAL_DEV_VAR_2 (\\"(hidden)\\")          Environment Variable      local
				env.__DOT_ENV_LOCAL_DEV_VAR_3 (\\"(hidden)\\")          Environment Variable      local
				env.__DOT_ENV_LOCAL_DEV_VAR_LOCAL (\\"(hidden)\\")      Environment Variable      local"
			`);
		});
	});

	describe("serve static assets", () => {
		it("should error if --site is used with no value", async () => {
			await expect(
				runWrangler("dev --site")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Not enough arguments following: site]`
			);
		});

		describe("should indicate whether Sites is being used", () => {
			it("no use", async () => {
				writeWranglerConfig({
					main: "index.js",
				});
				fs.writeFileSync("index.js", `export default {};`);

				const config = await runWranglerUntilConfig("dev");
				expect(config.legacy.site).toBeFalsy();
			});
			it("--site arg", async () => {
				writeWranglerConfig({
					main: "index.js",
				});
				fs.writeFileSync("index.js", `export default {};`);

				const config = await runWranglerUntilConfig("dev --site abc");
				expect(config.legacy.site).toBeTruthy();
			});
		});
	});

	describe("--assets", () => {
		it("should not require entry point if using --assets", async () => {
			fs.mkdirSync("assets");
			writeWranglerConfig({
				assets: { directory: "assets" },
			});

			await runWranglerUntilConfig("dev");
		});

		it("should error if config.site and config.assets are used together", async () => {
			writeWranglerConfig({
				main: "./index.js",
				assets: { directory: "assets" },
				site: {
					bucket: "xyz",
				},
			});
			fs.writeFileSync("index.js", `export default {};`);
			fs.mkdirSync("assets");
			fs.mkdirSync("xyz");

			await expect(
				runWrangler("dev")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`
				[Error: Cannot use assets and Workers Sites in the same Worker.
				Please remove either the \`site\` or \`assets\` field from your configuration file.]
			`
			);
		});

		it("should error if config.site and --assets are used together", async () => {
			writeWranglerConfig({
				main: "./index.js",
				site: {
					bucket: "xyz",
				},
			});
			fs.writeFileSync("index.js", `export default {};`);
			fs.mkdirSync("assets");
			fs.mkdirSync("xyz");

			await expect(
				runWrangler("dev --assets assets")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`
				[Error: Cannot use assets and Workers Sites in the same Worker.
				Please remove either the \`site\` or \`assets\` field from your configuration file.]
			`
			);
		});

		it("should error if an ASSET binding is provided without a user Worker", async () => {
			writeWranglerConfig({
				assets: { directory: "assets", binding: "ASSETS" },
			});
			fs.mkdirSync("assets");
			await expect(
				runWrangler("dev")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`
				[Error: Cannot use assets with a binding in an assets-only Worker.
				Please remove the asset binding from your configuration file, or provide a Worker script in your configuration file (\`main\`).]
			`
			);
		});

		it("should warn if run_worker_first=true but no binding is provided", async () => {
			writeWranglerConfig({
				main: "index.js",
				assets: {
					directory: "assets",
					run_worker_first: true,
				},
			});
			fs.mkdirSync("assets");
			fs.writeFileSync("index.js", `export default {};`);

			await runWranglerUntilConfig("dev");

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mrun_worker_first=true set without an assets binding[0m

				  Setting run_worker_first to true will always invoke your Worker script.
				  To fetch your assets from your Worker, please set the [assets.binding] key in your configuration
				  file.

				  Read more: [4mhttps://developers.cloudflare.com/workers/static-assets/binding/#binding[0m

				"
			`);
		});

		it("should error if run_worker_first is true and no user Worker is provided", async () => {
			writeWranglerConfig({
				assets: { directory: "assets", run_worker_first: true },
			});
			fs.mkdirSync("assets");
			await expect(
				runWrangler("dev")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`
				[Error: Cannot set run_worker_first without a Worker script.
				Please remove run_worker_first from your configuration file, or provide a Worker script in your configuration file (\`main\`).]
			`
			);
		});

		it("should error if directory specified by '--assets' command line argument does not exist", async () => {
			writeWranglerConfig({
				main: "./index.js",
			});
			fs.writeFileSync("index.js", `export default {};`);
			await expect(runWrangler("dev --assets abc")).rejects.toThrow(
				new RegExp(
					'^The directory specified by the "--assets" command line argument does not exist:[Ss]*'
				)
			);
		});

		it("should error if directory specified by '[assets]' configuration key does not exist", async () => {
			writeWranglerConfig({
				main: "./index.js",
				assets: {
					directory: "abc",
				},
			});
			fs.writeFileSync("index.js", `export default {};`);
			await expect(runWrangler("dev")).rejects.toThrow(
				new RegExp(
					'^The directory specified by the "assets.directory" field in your configuration file does not exist:[Ss]*'
				)
			);
		});
	});

	describe("service bindings", () => {
		it("should warn when using service bindings", async () => {
			writeWranglerConfig({
				services: [
					{ binding: "WorkerA", service: "A" },
					{ binding: "WorkerB", service: "B", environment: "staging" },
				],
			});
			fs.writeFileSync("index.js", `export default {};`);
			await runWranglerUntilConfig("dev index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Your Worker has access to the following bindings:
				Binding              Resource      Mode
				env.WorkerA (A)      Worker        local [not connected]
				env.WorkerB (B)      Worker        local [not connected]

				"
			`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});
	});

	describe("print bindings", () => {
		it("should print bindings", async () => {
			writeWranglerConfig({
				services: [
					{ binding: "WorkerA", service: "A" },
					{ binding: "WorkerB", service: "B", environment: "staging" },
				],
			});
			fs.writeFileSync("index.js", `export default {};`);
			await runWranglerUntilConfig("dev index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Your Worker has access to the following bindings:
				Binding              Resource      Mode
				env.WorkerA (A)      Worker        local [not connected]
				env.WorkerB (B)      Worker        local [not connected]

				"
			`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should mask vars that were overriden in .dev.vars", async () => {
			writeWranglerConfig({
				vars: {
					variable: 123,
					overriden: "original values",
				},
			});
			fs.writeFileSync(
				".dev.vars",
				`
        SECRET = "A secret"
        overriden = "overriden value"
      `
			);
			fs.writeFileSync("index.js", `export default {};`);
			await runWranglerUntilConfig("dev index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Using vars defined in .dev.vars
				Your Worker has access to the following bindings:
				Binding                         Resource                  Mode
				env.variable (123)              Environment Variable      local
				env.overriden (\\"(hidden)\\")      Environment Variable      local
				env.SECRET (\\"(hidden)\\")         Environment Variable      local

				"
			`);
		});
	});

	describe("`browser rendering binding", () => {
		it("should not show error when running locally", async () => {
			writeWranglerConfig({
				browser: {
					binding: "MYBROWSER",
				},
			});
			fs.writeFileSync("index.js", `export default {};`);

			await expect(
				runWrangler("dev index.js")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				"[Error: Bailing early in tests]"
			);
		});
	});

	it("should error helpfully if pages_build_output_dir is set", async () => {
		writeWranglerConfig({ pages_build_output_dir: "dist", name: "test" });
		await expect(runWrangler("dev")).rejects.toThrowErrorMatchingInlineSnapshot(
			`
			[Error: It looks like you've run a Workers-specific command in a Pages project.
			For Pages, please run \`wrangler pages dev\` instead.]
		`
		);
	});

	describe("remote bindings", () => {
		const wranglerConfigWithRemoteBindings = {
			services: [
				{ binding: "WorkerA", service: "A", experimental_remote: true },
			],
			kv_namespaces: [
				{
					binding: "KV",
					id: "xxxx-xxxx-xxxx-xxxx",
					experimental_remote: true,
				},
			],
			r2_buckets: [
				{
					binding: "MY_R2",
					bucket_name: "my-bucket",
					experimental_remote: true,
				},
			],
			queues: {
				producers: [
					{
						binding: "MY_QUEUE_PRODUCES",
						queue: "my-queue",
						experimental_remote: true,
					},
				],
			},
			d1_databases: [
				{
					binding: "MY_D1",
					database_id: "xxx",
					experimental_remote: true,
				},
			],
			workflows: [
				{
					binding: "MY_WORKFLOW",
					name: "workflow-name",
					class_name: "myClass",
					experimental_remote: true,
				},
			],
		};

		it("should ignore remote true settings without the --x-remote-bindings flag (initial logs only test)", async () => {
			writeWranglerConfig(wranglerConfigWithRemoteBindings);
			fs.writeFileSync("index.js", `export default {};`);
			await runWranglerUntilConfig("dev index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Your Worker has access to the following bindings:
				Binding                                          Resource          Mode
				env.MY_WORKFLOW (myClass)                        Workflow          local
				env.KV (xxxx-xxxx-xxxx-xxxx)                     KV Namespace      local
				env.MY_QUEUE_PRODUCES (my-queue)                 Queue             local
				env.MY_D1 (xxx)                                  D1 Database       local
				env.MY_R2 (my-bucket)                            R2 Bucket         local
				env.WorkerA (A)                                  Worker            local [not connected]

				"
			`);
		});

		it("should honor the remote true settings with the --x-remote-bindings flag (initial logs only test)", async () => {
			writeWranglerConfig(wranglerConfigWithRemoteBindings);
			fs.writeFileSync("index.js", `export default {};`);
			await runWranglerUntilConfig("dev --x-remote-bindings index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Your Worker has access to the following bindings:
				Binding                                          Resource          Mode
				env.MY_WORKFLOW (myClass)                        Workflow          local
				env.KV (xxxx-xxxx-xxxx-xxxx)                     KV Namespace      remote
				env.MY_QUEUE_PRODUCES (my-queue)                 Queue             remote
				env.MY_D1 (xxx)                                  D1 Database       remote
				env.MY_R2 (my-bucket)                            R2 Bucket         remote
				env.WorkerA (A)                                  Worker            remote

				"
			`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});
	});

	describe("containers", () => {
		const containerConfig = {
			main: "index.js",
			compatibility_date: "2024-01-01",
			containers: [
				{
					class_name: "ContainerClass",
					image: "./Dockerfile",
				},
			],
			durable_objects: {
				bindings: [
					{
						name: "ContainerClass",
						class_name: "ContainerClass",
					},
				],
			},
			migrations: [
				{
					tag: "v1",
					new_sqlite_classes: ["ContainerClass"],
				},
			],
		};
		it("should warn when run in remote mode with (enabled) containers", async () => {
			writeWranglerConfig(containerConfig);
			fs.writeFileSync("index.js", `export default {};`);

			await expect(
				runWrangler("dev --remote")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Bailing early in tests]`
			);

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mContainers are only supported in local mode, to suppress this warning set \`dev.enable_containers\` to \`false\` or pass \`--enable-containers=false\` to the \`wrangler dev\` command[0m


				[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mSQLite in Durable Objects is only supported in local mode.[0m

				"
			`);
		});

		it("should not warn when run in remote mode with disabled containers", async () => {
			logger.clearHistory();
			writeWranglerConfig({
				...containerConfig,
				dev: {
					enable_containers: false,
				},
			});
			fs.writeFileSync("index.js", `export default {};`);

			await expect(
				runWrangler("dev --remote")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Bailing early in tests]`
			);

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mSQLite in Durable Objects is only supported in local mode.[0m

				"
			`);
		});
	});
});

function mockGetZones(domain: string, zones: { id: string }[] = []) {
	msw.use(
		http.get("*/zones", ({ request }) => {
			const url = new URL(request.url);

			expect(url.searchParams.get("name")).toEqual(domain);

			return HttpResponse.json(
				{
					success: true,
					errors: [],
					messages: [],
					result: zones,
				},
				{ status: 200 }
			);
		})
	);
}
