import { mkdirSync } from "node:fs";
import { rest } from "msw";
import { version as wranglerVersion } from "../../package.json";
import { purgeConfigCaches, saveToConfigCache } from "../config-cache";
import { CI } from "../is-ci";
import { logger } from "../logger";
import { getMetricsDispatcher, getMetricsConfig } from "../metrics";
import {
	CURRENT_METRICS_DATE,
	readMetricsConfig,
	USER_ID_CACHE_PATH,
	writeMetricsConfig,
} from "../metrics/metrics-config";
import { writeAuthConfigFile } from "../user";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm, clearDialogs } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw, mswSuccessOauthHandlers } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";

declare const global: { SPARROW_SOURCE_KEY: string | undefined };

describe("metrics", () => {
	const ORIGINAL_SPARROW_SOURCE_KEY = global.SPARROW_SOURCE_KEY;
	const std = mockConsoleMethods();
	runInTempDir();

	beforeEach(() => {
		// Tell jest to use the original version of the `getMetricsConfig()` function in these tests.
		const mockMetricsConfig = jest.requireMock("../metrics/metrics-config");
		mockMetricsConfig.useOriginal = true;
		global.SPARROW_SOURCE_KEY = "MOCK_KEY";
		logger.loggerLevel = "debug";
		// Create a node_modules directory to store config-cache files
		mkdirSync("node_modules");
	});
	afterEach(() => {
		global.SPARROW_SOURCE_KEY = ORIGINAL_SPARROW_SOURCE_KEY;
		purgeConfigCaches();
		clearDialogs();
	});

	describe("getMetricsDispatcher()", () => {
		const MOCK_DISPATCHER_OPTIONS = {
			// By setting this to true we avoid the `getMetricsConfig()` logic in these tests.
			sendMetrics: true,
			offline: false,
		};

		// These tests should never hit the `/user` API endpoint.
		const userRequests = mockUserRequest();
		afterEach(() => {
			expect(userRequests.count).toBe(0);
		});

		describe("identify()", () => {
			it("should send a request to the default URL", async () => {
				const request = mockMetricRequest(
					{
						event: "identify",
						properties: {
							category: "Workers",
							wranglerVersion,
							os: process.platform + ":" + process.arch,
							a: 1,
							b: 2,
						},
					},
					{ "Sparrow-Source-Key": "MOCK_KEY" },
					"identify"
				);
				const dispatcher = await getMetricsDispatcher(MOCK_DISPATCHER_OPTIONS);
				await dispatcher.identify({ a: 1, b: 2 });

				expect(request.count).toBe(1);
				expect(std.debug).toMatchInlineSnapshot(
					`"Metrics dispatcher: Posting data {\\"type\\":\\"identify\\",\\"name\\":\\"identify\\",\\"properties\\":{\\"a\\":1,\\"b\\":2}}"`
				);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should write a debug log if the dispatcher is disabled", async () => {
				const requests = mockMetricRequest({}, {}, "identify");
				const dispatcher = await getMetricsDispatcher({
					...MOCK_DISPATCHER_OPTIONS,
					sendMetrics: false,
				});
				await dispatcher.identify({ a: 1, b: 2 });
				await flushPromises();

				expect(requests.count).toBe(0);
				expect(std.debug).toMatchInlineSnapshot(
					`"Metrics dispatcher: Dispatching disabled - would have sent {\\"type\\":\\"identify\\",\\"name\\":\\"identify\\",\\"properties\\":{\\"a\\":1,\\"b\\":2}}."`
				);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should write a debug log if the request fails", async () => {
				msw.use(
					rest.post("*/identify", async (req, res) => {
						return res.networkError("BAD REQUEST");
					})
				);

				const dispatcher = await getMetricsDispatcher(MOCK_DISPATCHER_OPTIONS);
				await dispatcher.identify({ a: 1, b: 2 });
				await flushPromises();
				expect(std.debug).toMatchInlineSnapshot(`
			"Metrics dispatcher: Posting data {\\"type\\":\\"identify\\",\\"name\\":\\"identify\\",\\"properties\\":{\\"a\\":1,\\"b\\":2}}
			Metrics dispatcher: Failed to send request: request to https://sparrow.cloudflare.com/api/v1/identify failed, reason: BAD REQUEST"
		`);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should write a warning log if no source key has been provided", async () => {
				global.SPARROW_SOURCE_KEY = undefined;
				const dispatcher = await getMetricsDispatcher(MOCK_DISPATCHER_OPTIONS);
				await dispatcher.identify({ a: 1, b: 2 });
				expect(std.debug).toMatchInlineSnapshot(
					`"Metrics dispatcher: Source Key not provided. Be sure to initialize before sending events. { type: 'identify', name: 'identify', properties: { a: 1, b: 2 } }"`
				);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});
		});

		describe("sendEvent()", () => {
			it("should send a request to the default URL", async () => {
				const requests = mockMetricRequest(
					{
						event: "some-event",
						properties: {
							category: "Workers",
							wranglerVersion,
							os: process.platform + ":" + process.arch,
							a: 1,
							b: 2,
						},
					},
					{
						"Sparrow-Source-Key": "MOCK_KEY",
					},
					"event"
				);
				const dispatcher = await getMetricsDispatcher(MOCK_DISPATCHER_OPTIONS);
				await dispatcher.sendEvent("some-event", { a: 1, b: 2 });

				expect(requests.count).toBe(1);
				expect(std.debug).toMatchInlineSnapshot(
					`"Metrics dispatcher: Posting data {\\"type\\":\\"event\\",\\"name\\":\\"some-event\\",\\"properties\\":{\\"a\\":1,\\"b\\":2}}"`
				);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should write a debug log if the dispatcher is disabled", async () => {
				const requests = mockMetricRequest({}, {}, "event");

				const dispatcher = await getMetricsDispatcher({
					...MOCK_DISPATCHER_OPTIONS,
					sendMetrics: false,
				});
				await dispatcher.sendEvent("some-event", { a: 1, b: 2 });
				await flushPromises();

				expect(requests.count).toBe(0);
				expect(std.debug).toMatchInlineSnapshot(
					`"Metrics dispatcher: Dispatching disabled - would have sent {\\"type\\":\\"event\\",\\"name\\":\\"some-event\\",\\"properties\\":{\\"a\\":1,\\"b\\":2}}."`
				);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should write a debug log if the request fails", async () => {
				msw.use(
					rest.post("*/event", async (_, res) => {
						return res.networkError("BAD REQUEST");
					})
				);
				const dispatcher = await getMetricsDispatcher(MOCK_DISPATCHER_OPTIONS);
				await dispatcher.sendEvent("some-event", { a: 1, b: 2 });
				await flushPromises();
				expect(std.debug).toMatchInlineSnapshot(`
			"Metrics dispatcher: Posting data {\\"type\\":\\"event\\",\\"name\\":\\"some-event\\",\\"properties\\":{\\"a\\":1,\\"b\\":2}}
			Metrics dispatcher: Failed to send request: request to https://sparrow.cloudflare.com/api/v1/event failed, reason: BAD REQUEST"
		`);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should write a warning log if no source key has been provided", async () => {
				global.SPARROW_SOURCE_KEY = undefined;
				const requests = mockMetricRequest({}, {}, "event");
				const dispatcher = await getMetricsDispatcher(MOCK_DISPATCHER_OPTIONS);
				await dispatcher.sendEvent("some-event", { a: 1, b: 2 });

				expect(requests.count).toBe(0);
				expect(std.debug).toMatchInlineSnapshot(
					`"Metrics dispatcher: Source Key not provided. Be sure to initialize before sending events. { type: 'event', name: 'some-event', properties: { a: 1, b: 2 } }"`
				);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});
		});
	});

	describe("getMetricsConfig()", () => {
		let isCISpy: jest.SpyInstance;

		const { setIsTTY } = useMockIsTTY();
		beforeEach(() => {
			// Default the mock TTY to interactive for all these tests.
			setIsTTY(true);
			isCISpy = jest.spyOn(CI, "isCI").mockReturnValue(false);
		});

		describe("enabled", () => {
			const ORIGINAL_ENV = process.env;
			beforeEach(() => {
				process.env = { ...ORIGINAL_ENV };
			});
			afterEach(() => {
				process.env = ORIGINAL_ENV;
			});

			it("should return the WRANGLER_SEND_METRICS environment variable for enabled if it is defined", async () => {
				process.env.WRANGLER_SEND_METRICS = "false";
				expect(await getMetricsConfig({})).toMatchObject({
					enabled: false,
				});
				process.env.WRANGLER_SEND_METRICS = "true";
				expect(await getMetricsConfig({})).toMatchObject({
					enabled: true,
				});
			});

			it("should return false if running in a CI environment", async () => {
				isCISpy.mockReturnValue(true);
				expect(await getMetricsConfig({})).toMatchObject({
					enabled: false,
				});
			});

			it("should return the sendMetrics argument for enabled if it is defined", async () => {
				expect(
					await getMetricsConfig({ sendMetrics: false, offline: false })
				).toMatchObject({
					enabled: false,
				});
				expect(
					await getMetricsConfig({ sendMetrics: true, offline: false })
				).toMatchObject({
					enabled: true,
				});
			});

			it("should return enabled false if the process is not interactive", async () => {
				setIsTTY(false);
				expect(
					await getMetricsConfig({
						sendMetrics: undefined,
						offline: false,
					})
				).toMatchObject({
					enabled: false,
				});
			});

			it("should return enabled true if the user on this device previously agreed to send metrics", async () => {
				await writeMetricsConfig({
					permission: {
						enabled: true,
						date: new Date(2022, 6, 4),
					},
				});
				expect(
					await getMetricsConfig({
						sendMetrics: undefined,
						offline: false,
					})
				).toMatchObject({
					enabled: true,
				});
			});

			it("should return enabled false if the user on this device previously refused to send metrics", async () => {
				await writeMetricsConfig({
					permission: {
						enabled: false,
						date: new Date(2022, 6, 4),
					},
				});
				expect(
					await getMetricsConfig({
						sendMetrics: undefined,
						offline: false,
					})
				).toMatchObject({
					enabled: false,
				});
			});

			it("should accept and store permission granting to send metrics if the user agrees", async () => {
				mockConfirm({
					text: "Would you like to help improve Wrangler by sending usage metrics to Cloudflare?",
					result: true,
				});
				expect(
					await getMetricsConfig({
						sendMetrics: undefined,
						offline: false,
					})
				).toMatchObject({
					enabled: true,
				});
				expect((await readMetricsConfig()).permission).toMatchObject({
					enabled: true,
				});
			});

			it("should accept and store permission declining to send metrics if the user declines", async () => {
				mockConfirm({
					text: "Would you like to help improve Wrangler by sending usage metrics to Cloudflare?",
					result: false,
				});
				expect(
					await getMetricsConfig({
						sendMetrics: undefined,
						offline: false,
					})
				).toMatchObject({
					enabled: false,
				});
				expect((await readMetricsConfig()).permission).toMatchObject({
					enabled: false,
				});
			});

			it("should ignore the config if the permission date is older than the current metrics date", async () => {
				mockConfirm({
					text: "Would you like to help improve Wrangler by sending usage metrics to Cloudflare?",
					result: false,
				});
				const OLD_DATE = new Date(2000);
				await writeMetricsConfig({
					permission: { enabled: true, date: OLD_DATE },
				});
				expect(
					await getMetricsConfig({
						sendMetrics: undefined,
						offline: false,
					})
				).toMatchObject({
					enabled: false,
				});
				const { permission } = await readMetricsConfig();
				expect(permission?.enabled).toBe(false);
				// The date should be updated to today's date
				expect(permission?.date).toEqual(CURRENT_METRICS_DATE);

				expect(std.out).toMatchInlineSnapshot(`
			"Usage metrics tracking has changed since you last granted permission.
			Your choice has been saved in the following file: test-xdg-config/metrics.json.

			  You can override the user level setting for a project in \`wrangler.toml\`:

			   - to disable sending metrics for a project: \`send_metrics = false\`
			   - to enable sending metrics for a project: \`send_metrics = true\`"
		`);
			});
		});

		describe("deviceId", () => {
			it("should return a deviceId found in the config file", async () => {
				await writeMetricsConfig({ deviceId: "XXXX-YYYY-ZZZZ" });
				const { deviceId } = await getMetricsConfig({
					sendMetrics: true,
					offline: false,
				});
				expect(deviceId).toEqual("XXXX-YYYY-ZZZZ");
				expect((await readMetricsConfig()).deviceId).toEqual(deviceId);
			});

			it("should create and store a new deviceId if none is found in the config file", async () => {
				await writeMetricsConfig({});
				const { deviceId } = await getMetricsConfig({
					sendMetrics: true,
					offline: false,
				});
				expect(deviceId).toMatch(
					/[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}/
				);
				expect((await readMetricsConfig()).deviceId).toEqual(deviceId);
			});
		});

		describe("userId", () => {
			const userRequests = mockUserRequest();
			it("should return a userId found in a cache file", async () => {
				await saveToConfigCache(USER_ID_CACHE_PATH, {
					userId: "CACHED_USER_ID",
				});
				const { userId } = await getMetricsConfig({
					sendMetrics: true,
					offline: false,
				});
				expect(userId).toEqual("CACHED_USER_ID");
				expect(userRequests.count).toBe(0);
			});

			it("should fetch the userId from Cloudflare and store it in a cache file", async () => {
				writeAuthConfigFile({ oauth_token: "DUMMY_TOKEN" });
				const { userId } = await getMetricsConfig({
					sendMetrics: true,
					offline: false,
				});
				await flushPromises();

				expect(userId).toEqual("MOCK_USER_ID");
				expect(userRequests.count).toBe(1);
			});

			it("should not fetch the userId from Cloudflare if running in `offline` mode", async () => {
				writeAuthConfigFile({ oauth_token: "DUMMY_TOKEN" });
				const { userId } = await getMetricsConfig({
					sendMetrics: true,
					offline: true,
				});
				expect(userId).toBe(undefined);
				expect(userRequests.count).toBe(0);
			});
		});
	});
});

function mockUserRequest() {
	const requests = { count: 0 };
	beforeEach(() => {
		msw.use(
			...mswSuccessOauthHandlers,
			rest.get("*/user", (_, res, cxt) => {
				requests.count++;
				return res(
					cxt.status(200),
					cxt.json({
						success: true,
						errors: [],
						messages: [],
						result: { id: "MOCK_USER_ID" },
					})
				);
			})
		);
	});
	afterEach(() => {
		requests.count = 0;
	});
	return requests;
}

function mockMetricRequest(
	body: unknown,
	header: unknown,
	endpoint: "identify" | "event"
) {
	const requests = { count: 0 };
	msw.use(
		rest.post(`*/${endpoint}`, async (req, res, cxt) => {
			requests.count++;
			expect(await req.json()).toEqual(body);
			expect(req.headers).toContain(header);
			return res.once(cxt.status(200), cxt.json({}));
		})
	);

	return requests;
}

// Forces a tick to allow the non-awaited fetch promise to resolve.
function flushPromises(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
