import { http, HttpResponse } from "msw";
import { vi } from "vitest";
import { CI } from "../is-ci";
import { logger } from "../logger";
import { sendMetricsEvent } from "../metrics";
import {
	getNodeVersion,
	getOS,
	getOSVersion,
	getPlatform,
	getWranglerVersion,
} from "../metrics/helpers";
import {
	getMetricsConfig,
	readMetricsConfig,
	writeMetricsConfig,
} from "../metrics/metrics-config";
import {
	getMetricsDispatcher,
	redactArgValues,
} from "../metrics/metrics-dispatcher";
import { sniffUserAgent } from "../package-manager";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWranglerConfig } from "./helpers/write-wrangler-config";
import type { MockInstance } from "vitest";

vi.mock("../metrics/helpers");
vi.unmock("../metrics/metrics-config");
vi.mock("../metrics/send-event");
vi.mock("../package-manager");

// eslint-disable-next-line @typescript-eslint/no-namespace
declare module globalThis {
	let ALGOLIA_APP_ID: string | undefined;
	let ALGOLIA_PUBLIC_KEY: string | undefined;
}

describe("metrics", () => {
	let isCISpy: MockInstance;
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();
	runInTempDir();

	beforeEach(async () => {
		isCISpy = vi.spyOn(CI, "isCI").mockReturnValue(false);
		setIsTTY(true);
		vi.stubEnv("SPARROW_SOURCE_KEY", "MOCK_KEY");
		logger.loggerLevel = "debug";
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		isCISpy.mockClear();
	});

	describe("getMetricsDispatcher()", () => {
		beforeEach(() => {
			vi.mocked(getOS).mockReturnValue("foo:bar");
			vi.mocked(getWranglerVersion).mockReturnValue("1.2.3");
			vi.mocked(getOSVersion).mockReturnValue("mock os version");
			vi.mocked(getNodeVersion).mockReturnValue(1);
			vi.mocked(getPlatform).mockReturnValue("mock platform");
			vi.mocked(sniffUserAgent).mockReturnValue("npm");
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

		describe("sendAdhocEvent()", () => {
			it("should send a request to the default URL", async () => {
				const requests = mockMetricRequest();

				const dispatcher = getMetricsDispatcher({
					sendMetrics: true,
				});
				dispatcher.sendAdhocEvent("some-event", { a: 1, b: 2 });
				await Promise.all(dispatcher.requests);
				expect(requests.count).toBe(1);
				expect(std.debug).toMatchInlineSnapshot(
					`"Metrics dispatcher: Posting data {\\"deviceId\\":\\"f82b1f46-eb7b-4154-aa9f-ce95f23b2288\\",\\"event\\":\\"some-event\\",\\"timestamp\\":1733961600000,\\"properties\\":{\\"category\\":\\"Workers\\",\\"wranglerVersion\\":\\"1.2.3\\",\\"os\\":\\"foo:bar\\",\\"a\\":1,\\"b\\":2}}"`
				);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should write a debug log if the dispatcher is disabled", async () => {
				const requests = mockMetricRequest();
				const dispatcher = getMetricsDispatcher({
					sendMetrics: false,
				});
				dispatcher.sendAdhocEvent("some-event", { a: 1, b: 2 });

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
				const dispatcher = getMetricsDispatcher({
					sendMetrics: true,
				});
				dispatcher.sendAdhocEvent("some-event", { a: 1, b: 2 });
				await Promise.all(dispatcher.requests);

				expect(std.debug).toMatchInlineSnapshot(`
					"Metrics dispatcher: Posting data {\\"deviceId\\":\\"f82b1f46-eb7b-4154-aa9f-ce95f23b2288\\",\\"event\\":\\"some-event\\",\\"timestamp\\":1733961600000,\\"properties\\":{\\"category\\":\\"Workers\\",\\"wranglerVersion\\":\\"1.2.3\\",\\"os\\":\\"foo:bar\\",\\"a\\":1,\\"b\\":2}}
					Metrics dispatcher: Failed to send request: Failed to fetch"
				`);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should write a warning log if no source key has been provided", async () => {
				vi.stubEnv("SPARROW_SOURCE_KEY", undefined);

				const requests = mockMetricRequest();
				const dispatcher = getMetricsDispatcher({
					sendMetrics: true,
				});
				dispatcher.sendAdhocEvent("some-event", { a: 1, b: 2 });

				expect(requests.count).toBe(0);
				expect(std.debug).toMatchInlineSnapshot(
					`"Metrics dispatcher: Source Key not provided. Be sure to initialize before sending events {\\"deviceId\\":\\"f82b1f46-eb7b-4154-aa9f-ce95f23b2288\\",\\"event\\":\\"some-event\\",\\"timestamp\\":1733961600000,\\"properties\\":{\\"category\\":\\"Workers\\",\\"wranglerVersion\\":\\"1.2.3\\",\\"os\\":\\"foo:bar\\",\\"a\\":1,\\"b\\":2}}"`
				);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});
		});

		it("should keep track of all requests made", async () => {
			const requests = mockMetricRequest();
			const dispatcher = getMetricsDispatcher({
				sendMetrics: true,
			});

			dispatcher.sendAdhocEvent("some-event", { a: 1, b: 2 });
			expect(dispatcher.requests.length).toBe(1);

			expect(requests.count).toBe(0);
			await Promise.allSettled(dispatcher.requests);
			expect(requests.count).toBe(1);

			dispatcher.sendAdhocEvent("another-event", { c: 3, d: 4 });
			expect(dispatcher.requests.length).toBe(2);

			expect(requests.count).toBe(1);
			await Promise.allSettled(dispatcher.requests);
			expect(requests.count).toBe(2);
		});

		describe("sendCommandEvent()", () => {
			const reused = {
				wranglerVersion: "1.2.3",
				osPlatform: "mock platform",
				osVersion: "mock os version",
				nodeVersion: 1,
				packageManager: "npm",
				isFirstUsage: false,
				configFileType: "toml",
				isCI: false,
				isInteractive: true,
				argsUsed: [
					"j",
					"search",
					"xGradualRollouts",
					"xJsonConfig",
					"xVersions",
				],
				argsCombination: "j, search, xGradualRollouts, xJsonConfig, xVersions",
				command: "wrangler docs",
				args: {
					xJsonConfig: true,
					j: true,
					xVersions: true,
					xGradualRollouts: true,
					search: ["<REDACTED>"],
				},
			};
			beforeEach(() => {
				globalThis.ALGOLIA_APP_ID = "FAKE-ID";
				globalThis.ALGOLIA_PUBLIC_KEY = "FAKE-KEY";
				msw.use(
					http.post<Record<string, never>, { params: string | undefined }>(
						`*/1/indexes/developers-cloudflare2/query`,
						async ({ request }) => {
							vi.advanceTimersByTime(6000);
							return HttpResponse.json({
								hits: [
									{
										url: `FAKE_DOCS_URL:${await request.text()}`,
									},
								],
							});
						},
						{ once: true }
					)
				);
				// docs has an extra sendMetricsEvent call, just do nothing here
				// because we only want to test the top level sendNewEvent
				vi.mocked(sendMetricsEvent).mockImplementation(async () => {});
			});
			afterEach(() => {
				delete globalThis.ALGOLIA_APP_ID;
				delete globalThis.ALGOLIA_PUBLIC_KEY;
			});

			it("should send a started and completed event", async () => {
				writeWranglerConfig();
				const requests = mockMetricRequest();

				await runWrangler("docs arg");

				expect(requests.count).toBe(2);

				const expectedStartReq = {
					deviceId: "f82b1f46-eb7b-4154-aa9f-ce95f23b2288",
					event: "wrangler command started",
					timestamp: 1733961600000,
					properties: {
						amplitude_session_id: 1733961600000,
						amplitude_event_id: 0,
						...reused,
					},
				};
				expect(std.debug).toContain(
					`Posting data ${JSON.stringify(expectedStartReq)}`
				);
				const expectedCompleteReq = {
					deviceId: "f82b1f46-eb7b-4154-aa9f-ce95f23b2288",
					event: "wrangler command completed",
					timestamp: 1733961606000,
					properties: {
						amplitude_session_id: 1733961600000,
						amplitude_event_id: 1,
						...reused,
						durationMs: 6000,
						durationSeconds: 6,
						durationMinutes: 0.1,
					},
				};
				// command completed
				expect(std.debug).toContain(
					`Posting data ${JSON.stringify(expectedCompleteReq)}`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					Cloudflare collects anonymous telemetry about your usage of Wrangler. Learn more at https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler/telemetry.md
					Opening a link in your default browser: FAKE_DOCS_URL:{\\"params\\":\\"query=arg&hitsPerPage=1&getRankingInfo=0\\"}"
				`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should send a started and errored event", async () => {
				writeWranglerConfig();
				const requests = mockMetricRequest();
				msw.use(
					http.post<Record<string, never>, { params: string | undefined }>(
						`*/1/indexes/developers-cloudflare2/query`,
						async () => {
							vi.advanceTimersByTime(6000);
							return HttpResponse.error();
						},
						{ once: true }
					)
				);
				await expect(
					runWrangler("docs arg")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[TypeError: Failed to fetch]`
				);
				expect(requests.count).toBe(2);

				const expectedStartReq = {
					deviceId: "f82b1f46-eb7b-4154-aa9f-ce95f23b2288",
					event: "wrangler command started",
					timestamp: 1733961600000,
					properties: {
						amplitude_session_id: 1733961600000,
						amplitude_event_id: 0,
						...reused,
					},
				};
				expect(std.debug).toContain(
					`Posting data ${JSON.stringify(expectedStartReq)}`
				);

				const expectedErrorReq = {
					deviceId: "f82b1f46-eb7b-4154-aa9f-ce95f23b2288",
					event: "wrangler command errored",
					timestamp: 1733961606000,
					properties: {
						amplitude_session_id: 1733961600000,
						amplitude_event_id: 1,
						...reused,
						durationMs: 6000,
						durationSeconds: 6,
						durationMinutes: 0.1,
						errorType: "TypeError",
					},
				};

				expect(std.debug).toContain(
					`Posting data ${JSON.stringify(expectedErrorReq)}`
				);
			});

			it("should mark isCI as true if running in CI", async () => {
				isCISpy.mockReturnValue(true);
				const requests = mockMetricRequest();

				await runWrangler("docs arg");

				expect(requests.count).toBe(2);
				expect(std.debug).toContain('isCI":true');
			});

			it("should mark as non-interactive if running in non-interactive environment", async () => {
				setIsTTY(false);
				const requests = mockMetricRequest();

				await runWrangler("docs arg");

				expect(requests.count).toBe(2);
				expect(std.debug).toContain('"isInteractive":false,');
			});

			describe("banner", () => {
				beforeEach(() => {
					vi.mocked(getWranglerVersion).mockReturnValue("1.2.3");
				});
				it("should print the banner if current version is different to the stored version", async () => {
					writeMetricsConfig({
						permission: {
							enabled: true,
							date: new Date(2022, 6, 4),
							bannerLastShown: "1.2.1",
						},
					});

					const requests = mockMetricRequest();

					await runWrangler("docs arg");
					expect(std.out).toMatchInlineSnapshot(`
						"
						Cloudflare collects anonymous telemetry about your usage of Wrangler. Learn more at https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler/telemetry.md
						Opening a link in your default browser: FAKE_DOCS_URL:{\\"params\\":\\"query=arg&hitsPerPage=1&getRankingInfo=0\\"}"
					`);

					expect(requests.count).toBe(2);
				});
				it("should not print the banner if current version is the same as the stored version", async () => {
					writeMetricsConfig({
						permission: {
							enabled: true,
							date: new Date(2022, 6, 4),
							bannerLastShown: "1.2.3",
						},
					});
					const requests = mockMetricRequest();
					await runWrangler("docs arg");
					expect(std.out).not.toContain(
						"Cloudflare collects anonymous telemetry about your usage of Wrangler. Learn more at https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler/telemetry.md"
					);
					expect(requests.count).toBe(2);
				});
				it("should print the banner if nothing is stored under bannerLastShown and then store the current version", async () => {
					writeMetricsConfig({
						permission: {
							enabled: true,
							date: new Date(2022, 6, 4),
						},
					});
					const requests = mockMetricRequest();
					await runWrangler("docs arg");
					expect(std.out).toMatchInlineSnapshot(`
						"
						Cloudflare collects anonymous telemetry about your usage of Wrangler. Learn more at https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler/telemetry.md
						Opening a link in your default browser: FAKE_DOCS_URL:{\\"params\\":\\"query=arg&hitsPerPage=1&getRankingInfo=0\\"}"
					`);
					expect(requests.count).toBe(2);
					const { permission } = readMetricsConfig();
					expect(permission?.bannerLastShown).toEqual("1.2.3");
				});
				it("should not print the banner if telemetry permission is disabled", async () => {
					writeMetricsConfig({
						permission: {
							enabled: false,
							date: new Date(2022, 6, 4),
						},
					});
					const requests = mockMetricRequest();
					await runWrangler("docs arg");
					expect(std.out).not.toContain(
						"Cloudflare collects anonymous telemetry about your usage of Wrangler. Learn more at https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler/telemetry.md"
					);
					expect(requests.count).toBe(0);
					const { permission } = readMetricsConfig();
					expect(permission?.bannerLastShown).toBeUndefined();
				});
			});
		});

		describe("redactArgValues()", () => {
			it("should redact sensitive values", () => {
				const args = {
					default: false,
					array: ["beep", "boop"],
					secretArray: ["beep", "boop"],
					// Note how
					"secret-array": ["beep", "boop"],
					number: 42,
					string: "secret",
					secretString: "secret",
				};

				const redacted = redactArgValues(args, ["string", "array"]);
				expect(redacted).toEqual({
					default: false,
					array: ["beep", "boop"],
					secretArray: ["<REDACTED>", "<REDACTED>"],
					number: 42,
					string: "secret",
					secretString: "<REDACTED>",
				});
			});
		});
	});

	describe("getMetricsConfig()", () => {
		beforeEach(() => {
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

			it("should return the sendMetrics argument for enabled if it is defined", async () => {
				expect(await getMetricsConfig({ sendMetrics: false })).toMatchObject({
					enabled: false,
				});
				expect(await getMetricsConfig({ sendMetrics: true })).toMatchObject({
					enabled: true,
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
				writeWranglerConfig({ send_metrics: false });
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
				writeWranglerConfig({ send_metrics: true });
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

		it(`doesn't send telemetry when running "wrangler ${cmd} disable"`, async () => {
			const requests = mockMetricRequest();
			writeMetricsConfig({
				permission: {
					enabled: true,
					date: new Date(2022, 6, 4),
				},
			});
			await runWrangler(`${cmd} disable`);
			expect(requests.count).toBe(0);
			expect(std.debug).not.toContain("Metrics dispatcher: Posting data");
		});

		it(`does send telemetry when running "wrangler ${cmd} enable"`, async () => {
			const requests = mockMetricRequest();
			writeMetricsConfig({
				permission: {
					enabled: true,
					date: new Date(2022, 6, 4),
				},
			});
			await runWrangler(`${cmd} enable`);
			expect(requests.count).toBe(2);
			expect(std.debug).toContain("Metrics dispatcher: Posting data");
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

function mockMetricRequest() {
	const requests = { count: 0 };
	msw.use(
		http.post(`*/event`, async () => {
			requests.count++;
			return HttpResponse.json({}, { status: 200 });
		})
	);

	return requests;
}
