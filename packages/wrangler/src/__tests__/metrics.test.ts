import { http, HttpResponse } from "msw";
import { vi } from "vitest";
import { CI } from "../is-ci";
import { logger } from "../logger";
import { getOS, getWranglerVersion } from "../metrics/helpers";
import {
	getMetricsConfig,
	readMetricsConfig,
	writeMetricsConfig,
} from "../metrics/metrics-config";
import { getMetricsDispatcher } from "../metrics/metrics-dispatcher";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWranglerToml } from "./helpers/write-wrangler-toml";
import type { MockInstance } from "vitest";

vi.mock("../metrics/helpers");
vi.unmock("../metrics/metrics-config");

describe("metrics", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	beforeEach(async () => {
		vi.stubEnv("SPARROW_SOURCE_KEY", "MOCK_KEY");
		logger.loggerLevel = "debug";
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("getMetricsDispatcher()", () => {
		beforeEach(() => {
			vi.mocked(getOS).mockReturnValue("foo:bar");
			vi.mocked(getWranglerVersion).mockReturnValue("1.2.3");
			vi.useFakeTimers({
				now: new Date(2024, 11, 12),
			});
			writeMetricsConfig({
				permission: {
					enabled: true,
					date: new Date(2024, 11, 11),
				},
				deviceId: "f82b1f46-eb7b-4154-aa9f-ce95f23b2288",
			});
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		describe("sendEvent()", () => {
			it("should send a request to the default URL", async () => {
				const requests = mockMetricRequest(
					{
						event: "some-event",
						properties: {
							category: "Workers",
							wranglerVersion: "1.2.3",
							os: "foo:bar",
							a: 1,
							b: 2,
						},
					},
					{
						"Sparrow-Source-Key": "MOCK_KEY",
					},
					"event"
				);
				const dispatcher = await getMetricsDispatcher({
					sendMetrics: true,
				});
				await dispatcher.sendEvent("some-event", { a: 1, b: 2 });

				expect(requests.count).toBe(1);
				expect(std.debug).toMatchInlineSnapshot(
					`"Metrics dispatcher: Posting data {\\"deviceId\\":\\"f82b1f46-eb7b-4154-aa9f-ce95f23b2288\\",\\"event\\":\\"some-event\\",\\"timestamp\\":1733961600000,\\"properties\\":{\\"category\\":\\"Workers\\",\\"wranglerVersion\\":\\"1.2.3\\",\\"os\\":\\"foo:bar\\",\\"a\\":1,\\"b\\":2}}"`
				);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should write a debug log if the dispatcher is disabled", async () => {
				const requests = mockMetricRequest({}, {}, "event");
				const dispatcher = await getMetricsDispatcher({
					sendMetrics: false,
				});
				await dispatcher.sendEvent("some-event", { a: 1, b: 2 });

				expect(requests.count).toBe(0);
				expect(std.debug).toMatchInlineSnapshot(
					`"Metrics dispatcher: Dispatching disabled - would have sent {\\"deviceId\\":\\"f82b1f46-eb7b-4154-aa9f-ce95f23b2288\\",\\"event\\":\\"some-event\\",\\"timestamp\\":1733961600000,\\"properties\\":{\\"category\\":\\"Workers\\",\\"wranglerVersion\\":\\"1.2.3\\",\\"os\\":\\"foo:bar\\",\\"a\\":1,\\"b\\":2}}."`
				);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should write a debug log if the request fails", async () => {
				msw.use(
					http.post("*/event", async () => {
						return HttpResponse.error();
					})
				);
				const dispatcher = await getMetricsDispatcher({
					sendMetrics: true,
				});
				await dispatcher.sendEvent("some-event", { a: 1, b: 2 });
				await flushPromises();

				expect(std.debug).toMatchInlineSnapshot(
					`
					"Metrics dispatcher: Posting data {\\"deviceId\\":\\"f82b1f46-eb7b-4154-aa9f-ce95f23b2288\\",\\"event\\":\\"some-event\\",\\"timestamp\\":1733961600000,\\"properties\\":{\\"category\\":\\"Workers\\",\\"wranglerVersion\\":\\"1.2.3\\",\\"os\\":\\"foo:bar\\",\\"a\\":1,\\"b\\":2}}
					Metrics dispatcher: Failed to send request: Failed to fetch"
				`
				);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should write a warning log if no source key has been provided", async () => {
				vi.stubEnv("SPARROW_SOURCE_KEY", undefined);

				const requests = mockMetricRequest({}, {}, "event");
				const dispatcher = await getMetricsDispatcher({
					sendMetrics: true,
				});
				await dispatcher.sendEvent("some-event", { a: 1, b: 2 });

				expect(requests.count).toBe(0);
				expect(std.debug).toMatchInlineSnapshot(
					`"Metrics dispatcher: Source Key not provided. Be sure to initialize before sending events {\\"deviceId\\":\\"f82b1f46-eb7b-4154-aa9f-ce95f23b2288\\",\\"event\\":\\"some-event\\",\\"timestamp\\":1733961600000,\\"properties\\":{\\"category\\":\\"Workers\\",\\"wranglerVersion\\":\\"1.2.3\\",\\"os\\":\\"foo:bar\\",\\"a\\":1,\\"b\\":2}}"`
				);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});
		});
	});

	describe("getMetricsConfig()", () => {
		let isCISpy: MockInstance;

		const { setIsTTY } = useMockIsTTY();
		beforeEach(() => {
			// Default the mock TTY to interactive for all these tests.
			setIsTTY(true);
			isCISpy = vi.spyOn(CI, "isCI").mockReturnValue(false);
		});

		describe("enabled", () => {
			it("should return the WRANGLER_SEND_METRICS environment variable for enabled if it is defined", async () => {
				vi.stubEnv("WRANGLER_SEND_METRICS", "false");
				expect(await getMetricsConfig({})).toMatchObject({
					enabled: false,
				});
				vi.stubEnv("WRANGLER_SEND_METRICS", "true");
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
				expect(await getMetricsConfig({ sendMetrics: false })).toMatchObject({
					enabled: false,
				});
				expect(await getMetricsConfig({ sendMetrics: true })).toMatchObject({
					enabled: true,
				});
			});

			it("should return enabled false if the process is not interactive", async () => {
				setIsTTY(false);
				expect(
					await getMetricsConfig({
						sendMetrics: undefined,
					})
				).toMatchObject({
					enabled: false,
				});
			});

			it("should return enabled true if the user on this device previously agreed to send metrics", async () => {
				writeMetricsConfig({
					permission: {
						enabled: true,
						date: new Date(2022, 6, 4),
					},
				});
				expect(
					await getMetricsConfig({
						sendMetrics: undefined,
					})
				).toMatchObject({
					enabled: true,
				});
			});

			it("should return enabled false if the user on this device previously refused to send metrics", async () => {
				writeMetricsConfig({
					permission: {
						enabled: false,
						date: new Date(2022, 6, 4),
					},
				});
				expect(
					await getMetricsConfig({
						sendMetrics: undefined,
					})
				).toMatchObject({
					enabled: false,
				});
			});

			it("should print a message if the permission date is older than the current metrics date", async () => {
				vi.useFakeTimers();
				vi.setSystemTime(new Date(2024, 11, 12));
				const OLD_DATE = new Date(2000);
				writeMetricsConfig({
					permission: { enabled: true, date: OLD_DATE },
				});
				expect(
					await getMetricsConfig({
						sendMetrics: undefined,
					})
				).toMatchObject({
					enabled: true,
				});
				const { permission } = readMetricsConfig();
				expect(permission?.enabled).toBe(true);
				// The date should be updated to today's date
				expect(permission?.date).toEqual(new Date(2024, 11, 12));

				expect(std.out).toMatchInlineSnapshot(`
			"Usage metrics tracking has changed since you last granted permission."
		`);
				vi.useRealTimers();
			});
		});

		describe("deviceId", () => {
			it("should return a deviceId found in the config file", async () => {
				writeMetricsConfig({ deviceId: "XXXX-YYYY-ZZZZ" });
				const { deviceId } = await getMetricsConfig({
					sendMetrics: true,
				});
				expect(deviceId).toEqual("XXXX-YYYY-ZZZZ");
				expect(readMetricsConfig().deviceId).toEqual(deviceId);
			});

			it("should create and store a new deviceId if none is found in the config file", async () => {
				writeMetricsConfig({});
				const { deviceId } = await getMetricsConfig({
					sendMetrics: true,
				});
				expect(deviceId).toMatch(
					/[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}/
				);
				expect(readMetricsConfig().deviceId).toEqual(deviceId);
			});
		});
	});

	describe.each(["metrics", "telemetry"])("%s commands", (cmd) => {
		beforeEach(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date(2024, 11, 12));
		});
		afterEach(() => {
			vi.useRealTimers();
		});
		describe(`${cmd} status`, () => {
			it("prints the current telemetry status based on the cached metrics config", async () => {
				writeMetricsConfig({
					permission: {
						enabled: true,
						date: new Date(2022, 6, 4),
					},
				});
				await runWrangler(`${cmd} status`);
				expect(std.out).toContain("Status: Enabled");
				expect(std.out).not.toContain("Status: Disabled");
				writeMetricsConfig({
					permission: {
						enabled: false,
						date: new Date(2022, 6, 4),
					},
				});
				await runWrangler("telemetry status");
				expect(std.out).toContain("Status: Disabled");
			});

			it("shows wrangler.toml as the source with send_metrics is present", async () => {
				writeMetricsConfig({
					permission: {
						enabled: true,
						date: new Date(2022, 6, 4),
					},
				});
				writeWranglerToml({ send_metrics: false });
				await runWrangler(`${cmd} status`);
				expect(std.out).toContain("Status: Disabled (set by wrangler.toml)");
			});

			it("shows environment variable as the source if used", async () => {
				writeMetricsConfig({
					permission: {
						enabled: true,
						date: new Date(2022, 6, 4),
					},
				});
				vi.stubEnv("WRANGLER_SEND_METRICS", "false");
				await runWrangler(`${cmd} status`);
				expect(std.out).toContain(
					"Status: Disabled (set by environment variable)"
				);
			});

			it("defaults to enabled if metrics config is not set", async () => {
				writeMetricsConfig({});
				await runWrangler(`${cmd} status`);
				expect(std.out).toContain("Status: Enabled");
			});

			it("prioritises environment variable over send_metrics", async () => {
				writeMetricsConfig({
					permission: {
						enabled: true,
						date: new Date(2022, 6, 4),
					},
				});
				writeWranglerToml({ send_metrics: true });
				vi.stubEnv("WRANGLER_SEND_METRICS", "false");
				await runWrangler(`${cmd} status`);
				expect(std.out).toContain(
					"Status: Disabled (set by environment variable)"
				);
			});
		});

		it(`disables telemetry when "wrangler ${cmd} disable" is run`, async () => {
			writeMetricsConfig({
				permission: {
					enabled: true,
					date: new Date(2022, 6, 4),
				},
			});
			await runWrangler(`${cmd} disable`);
			expect(std.out).toContain(`Status: Disabled

Wrangler is no longer collecting telemetry about your usage.`);
			expect(readMetricsConfig()).toMatchObject({
				permission: {
					enabled: false,
					date: new Date(2024, 11, 12),
				},
			});
		});

		it(`enables telemetry when "wrangler ${cmd} enable" is run`, async () => {
			writeMetricsConfig({
				permission: {
					enabled: false,
					date: new Date(2022, 6, 4),
				},
			});
			await runWrangler(`${cmd} enable`);
			expect(std.out).toContain(`Status: Enabled

Wrangler is now collecting telemetry about your usage. Thank you for helping make Wrangler better 🧡`);
			expect(readMetricsConfig()).toMatchObject({
				permission: {
					enabled: true,
					date: new Date(2024, 11, 12),
				},
			});
		});

		it("doesn't overwrite c3 telemetry config", async () => {
			writeMetricsConfig({
				c3permission: {
					enabled: false,
					date: new Date(2022, 6, 4),
				},
			});
			await runWrangler(`${cmd} enable`);
			expect(std.out).toContain(`Status: Enabled

Wrangler is now collecting telemetry about your usage. Thank you for helping make Wrangler better 🧡`);
			const config = readMetricsConfig();
			expect(config).toMatchObject({
				c3permission: {
					enabled: false,
					date: new Date(2022, 6, 4),
				},
				permission: {
					enabled: true,
					date: new Date(2024, 11, 12),
				},
			});
		});
	});
});

function mockMetricRequest(
	body: unknown,
	header: unknown,
	endpoint: "identify" | "event"
) {
	const requests = { count: 0 };
	msw.use(
		http.post(
			`*/${endpoint}`,
			async ({ request }) => {
				requests.count++;
				expect(await request.json()).toEqual(body);
				expect(request.headers).toContain(header);
				return HttpResponse.json({}, { status: 200 });
			},
			{ once: true }
		)
	);

	return requests;
}

// Forces a tick to allow the non-awaited fetch promise to resolve.
async function flushPromises(): Promise<void> {
	await Promise.all([
		new Promise((resolve) => setTimeout(resolve, 0)),
		vi.advanceTimersToNextTimerAsync(),
	]);
}
