import path from "node:path";
import * as Sentry from "@sentry/node";
import { http, HttpResponse } from "msw";
import { afterEach, assert, beforeEach, describe, it } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

declare const global: { SENTRY_DSN: string | undefined };

interface EnvelopeRequest {
	envelope: string;
	url: string;
}

describe("sentry", () => {
	const ORIGINAL_SENTRY_DSN = global.SENTRY_DSN;
	const std = mockConsoleMethods();
	runInTempDir();
	mockAccountId();
	mockApiToken();
	const { setIsTTY } = useMockIsTTY();

	let sentryRequests: EnvelopeRequest[] | undefined;

	beforeEach(() => {
		global.SENTRY_DSN =
			"https://9edbb8417b284aa2bbead9b4c318918b@sentry.example.com/24601";

		sentryRequests = mockSentryEndpoint();
		Sentry.getCurrentScope().clearBreadcrumbs();
	});
	afterEach(() => {
		global.SENTRY_DSN = ORIGINAL_SENTRY_DSN;
		clearDialogs();
		msw.resetHandlers();
	});
	describe("non interactive", () => {
		beforeEach(() => setIsTTY(false));
		it("should not hit sentry in normal usage", async ({ expect }) => {
			await runWrangler("--version");
			expect(sentryRequests?.length).toEqual(0);
		});

		it("should not hit sentry after error", async ({ expect }) => {
			// Trigger an API error
			msw.use(
				http.get(
					`https://api.cloudflare.com/client/v4/user`,
					async () => {
						return HttpResponse.error();
					},
					{ once: true }
				),
				http.get("*/user/tokens/verify", () => {
					return HttpResponse.json(createFetchResult([]));
				})
			);
			await expect(runWrangler("whoami")).rejects.toMatchInlineSnapshot(
				`[TypeError: Failed to fetch]`
			);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Getting User settings...

				[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m
				? Would you like to report this error to Cloudflare? Wrangler's output and the error details will be shared with the Wrangler team to help us diagnose and fix the issue.
				🤖 Using fallback value in non-interactive context: no"
			`);
			expect(sentryRequests?.length).toEqual(0);
		});
	});
	describe("interactive", () => {
		beforeEach(() => {
			setIsTTY(true);
		});
		afterEach(() => {
			setIsTTY(false);
		});

		it("should not hit sentry in normal usage", async ({ expect }) => {
			await runWrangler("--version");
			expect(sentryRequests?.length).toEqual(0);
		});

		it("should not hit sentry with user error", async ({ expect }) => {
			await expect(runWrangler("delete")).rejects.toMatchInlineSnapshot(
				`[Error: A worker name must be defined, either via --name, or in your Wrangler configuration file]`
			);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				"
			`);
			expect(sentryRequests?.length).toEqual(0);
		});

		it("should not hit sentry after reportable error when permission denied", async ({
			expect,
		}) => {
			// Trigger an API error
			msw.use(
				http.get(
					`https://api.cloudflare.com/client/v4/user`,
					async () => {
						return HttpResponse.error();
					},
					{ once: true }
				),
				http.get("*/user/tokens/verify", () => {
					return HttpResponse.json(createFetchResult([]));
				})
			);
			mockConfirm({
				text: "Would you like to report this error to Cloudflare? Wrangler's output and the error details will be shared with the Wrangler team to help us diagnose and fix the issue.",
				result: false,
			});
			await expect(runWrangler("whoami")).rejects.toMatchInlineSnapshot(
				`[TypeError: Failed to fetch]`
			);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Getting User settings...

				[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
			`);
			expect(sentryRequests?.length).toEqual(0);
		});

		it("should not hit sentry (or even ask) after reportable error if WRANGLER_SEND_ERROR_REPORTS is explicitly false", async ({
			expect,
		}) => {
			// Trigger an API error
			msw.use(
				http.get(
					`https://api.cloudflare.com/client/v4/user`,
					async () => {
						return HttpResponse.error();
					},
					{ once: true }
				),
				http.get("*/user/tokens/verify", () => {
					return HttpResponse.json(createFetchResult([]));
				})
			);
			await expect(
				runWrangler("whoami", { WRANGLER_SEND_ERROR_REPORTS: "false" })
			).rejects.toMatchInlineSnapshot(`[TypeError: Failed to fetch]`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Getting User settings...

				[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
			`);
			expect(sentryRequests?.length).toEqual(0);
		});

		it("should hit sentry after reportable error when permission provided", async ({
			expect,
		}) => {
			// Trigger an API error
			msw.use(
				http.get(
					`https://api.cloudflare.com/client/v4/user`,
					async () => {
						return HttpResponse.error();
					},
					{ once: true }
				),
				http.get("*/user/tokens/verify", () => {
					return HttpResponse.json(createFetchResult([]));
				})
			);
			mockConfirm({
				text: "Would you like to report this error to Cloudflare? Wrangler's output and the error details will be shared with the Wrangler team to help us diagnose and fix the issue.",
				result: true,
			});
			await expect(runWrangler("whoami")).rejects.toMatchInlineSnapshot(
				`[TypeError: Failed to fetch]`
			);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Getting User settings...

				[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
			`);

			// Sentry sends multiple HTTP requests to capture breadcrumbs
			assert(sentryRequests);
			expect(sentryRequests.length).toBeGreaterThan(0);

			// Check requests don't include PII
			const envelopes = sentryRequests.map(({ envelope }) => {
				const parts = envelope.split("\n").map((line) => JSON.parse(line));
				expect(parts).toHaveLength(3);
				return { header: parts[0], type: parts[1], data: parts[2] };
			});
			const event = envelopes.find(({ type }) => type.type === "event");
			assert(event);

			// Redact fields with random contents we know don't contain PII
			event.header.event_id = "";
			event.header.sent_at = "";
			event.header.trace.trace_id = "";
			event.header.trace.release = "";
			for (const exception of event.data.exception.values) {
				for (const frame of exception.stacktrace.frames) {
					if (
						frame.filename.startsWith("C:\\Project\\") ||
						frame.filename.startsWith("/project/")
					) {
						frame.filename = "/project/...";
					}
					frame.function = "";
					frame.lineno = 0;
					frame.colno = 0;
					frame.in_app = false;
					frame.pre_context = [];
					frame.context_line = "";
					frame.post_context = [];
				}
			}
			event.data.event_id = "";
			event.data.contexts.trace.trace_id = "";
			event.data.contexts.trace.span_id = "";
			event.data.contexts.runtime.version = "";
			event.data.contexts.app.app_start_time = "";
			event.data.contexts.app.app_memory = 0;
			event.data.contexts.os = {};
			event.data.contexts.device = {};
			event.data.timestamp = 0;
			event.data.release = "";
			for (const breadcrumb of event.data.breadcrumbs) {
				breadcrumb.timestamp = 0;
			}

			const fakeInstallPath = "/wrangler/";
			for (const exception of event.data.exception?.values ?? []) {
				for (const frame of exception.stacktrace?.frames ?? []) {
					if (frame.module.startsWith("@mswjs")) {
						frame.module =
							"@mswjs.interceptors.src.interceptors.fetch:index.ts";
					}
					if (frame.filename === undefined) {
						continue;
					}

					const wranglerPackageIndex = frame.filename.indexOf(
						path.join("packages", "wrangler", "src")
					);
					if (wranglerPackageIndex === -1) {
						continue;
					}
					frame.filename =
						fakeInstallPath +
						frame.filename
							.substring(wranglerPackageIndex)
							.replaceAll("\\", "/");
					continue;
				}
			}

			// If more data is included in the Sentry request, we'll need to verify it
			// couldn't contain PII and update this snapshot
			expect(event).toStrictEqual({
				data: {
					breadcrumbs: [
						{
							level: "log",
							message: "wrangler whoami",
							timestamp: 0,
						},
					],
					contexts: {
						app: {
							app_memory: 0,
							app_start_time: "",
						},
						cloud_resource: {},
						device: {},
						os: {},
						runtime: {
							name: "node",
							version: "",
						},
						trace: {
							span_id: "",
							trace_id: "",
						},
					},
					environment: "production",
					event_id: "",
					exception: {
						values: [
							{
								mechanism: {
									handled: true,
									type: "generic",
								},
								stacktrace: {
									frames: [
										{
											colno: 0,
											context_line: "",
											filename: expect.any(String),
											function: "",
											in_app: false,
											lineno: 0,
											module: expect.any(String),
											post_context: [],
											pre_context: [],
										},
										{
											colno: 0,
											context_line: "",
											filename: expect.any(String),
											function: "",
											in_app: false,
											lineno: 0,
											module: expect.any(String),
											post_context: [],
											pre_context: [],
										},
										{
											colno: 0,
											context_line: "",
											filename: expect.any(String),
											function: "",
											in_app: false,
											lineno: 0,
											module: expect.any(String),
											post_context: [],
											pre_context: [],
										},
										{
											colno: 0,
											context_line: "",
											filename: expect.any(String),
											function: "",
											in_app: false,
											lineno: 0,
											module: expect.any(String),
											post_context: [],
											pre_context: [],
										},
										{
											colno: 0,
											context_line: "",
											filename: expect.any(String),
											function: "",
											in_app: false,
											lineno: 0,
											module: expect.any(String),
											post_context: [],
											pre_context: [],
										},
										{
											colno: 0,
											context_line: "",
											filename: expect.any(String),
											function: "",
											in_app: false,
											lineno: 0,
											module: expect.any(String),
											post_context: [],
											pre_context: [],
										},
										{
											colno: 0,
											context_line: "",
											filename: expect.any(String),
											function: "",
											in_app: false,
											lineno: 0,
											module: expect.any(String),
											post_context: [],
											pre_context: [],
										},
										{
											colno: 0,
											context_line: "",
											filename: expect.any(String),
											function: "",
											in_app: false,
											lineno: 0,
											module: expect.any(String),
											post_context: [],
											pre_context: [],
										},
										{
											colno: 0,
											context_line: "",
											filename: "/project/...",
											function: "",
											in_app: false,
											lineno: 0,
											module:
												"@mswjs.interceptors.src.interceptors.fetch:index.ts",
											post_context: [],
											pre_context: [],
										},
										{
											colno: 0,
											context_line: "",
											filename: "/project/...",
											function: "",
											in_app: false,
											lineno: 0,
											module:
												"@mswjs.interceptors.src.interceptors.fetch:index.ts",
											post_context: [],
											pre_context: [],
										},
									],
								},
								type: "TypeError",
								value: "Failed to fetch",
							},
						],
					},
					modules: {},
					platform: "node",
					release: "",
					sdk: {
						integrations: [
							"InboundFilters",
							"FunctionToString",
							"LinkedErrors",
							"Console",
							"OnUncaughtException",
							"OnUnhandledRejection",
							"ContextLines",
							"Context",
							"Modules",
						],
						name: "sentry.javascript.node",
						packages: [
							{
								name: "npm:@sentry/node",
								version: "7.87.0",
							},
						],
						version: "7.87.0",
					},
					timestamp: 0,
				},
				header: {
					event_id: "",
					sdk: {
						name: "sentry.javascript.node",
						version: "7.87.0",
					},
					sent_at: "",
					trace: {
						environment: "production",
						public_key: "9edbb8417b284aa2bbead9b4c318918b",
						release: "",
						trace_id: "",
					},
				},
				type: {
					type: "event",
				},
			});
		});

		it("should hit sentry after reportable error (without confirmation) if WRANGLER_SEND_ERROR_REPORTS is explicitly true", async ({
			expect,
		}) => {
			// Trigger an API error
			msw.use(
				http.get(
					`https://api.cloudflare.com/client/v4/user`,
					async () => {
						return HttpResponse.error();
					},
					{ once: true }
				),
				http.get("*/user/tokens/verify", () => {
					return HttpResponse.json(createFetchResult([]));
				})
			);
			await expect(
				runWrangler("whoami", { WRANGLER_SEND_ERROR_REPORTS: "true" })
			).rejects.toMatchInlineSnapshot(`[TypeError: Failed to fetch]`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Getting User settings...

				[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
			`);

			// Sentry sends multiple HTTP requests to capture breadcrumbs
			assert(sentryRequests !== undefined);
			expect(sentryRequests.length).toBeGreaterThan(0);

			// Check requests don't include PII
			const envelopes = sentryRequests.map(({ envelope }) => {
				const parts = envelope.split("\n").map((line) => JSON.parse(line));
				expect(parts).toHaveLength(3);
				return { header: parts[0], type: parts[1], data: parts[2] };
			});
			const event = envelopes.find(({ type }) => type.type === "event");
			assert(event !== undefined);

			// Redact fields with random contents we know don't contain PII
			event.header.event_id = "";
			event.header.sent_at = "";
			event.header.trace.trace_id = "";
			event.header.trace.release = "";
			for (const exception of event.data.exception.values) {
				for (const frame of exception.stacktrace.frames) {
					if (
						frame.filename.startsWith("C:\\Project\\") ||
						frame.filename.startsWith("/project/")
					) {
						frame.filename = "/project/...";
					}
					frame.function = "";
					frame.lineno = 0;
					frame.colno = 0;
					frame.in_app = false;
					frame.pre_context = [];
					frame.context_line = "";
					frame.post_context = [];
				}
			}
			event.data.event_id = "";
			event.data.contexts.trace.trace_id = "";
			event.data.contexts.trace.span_id = "";
			event.data.contexts.runtime.version = "";
			event.data.contexts.app.app_start_time = "";
			event.data.contexts.app.app_memory = 0;
			event.data.contexts.os = {};
			event.data.contexts.device = {};
			event.data.timestamp = 0;
			event.data.release = "";
			for (const breadcrumb of event.data.breadcrumbs) {
				breadcrumb.timestamp = 0;
			}

			const fakeInstallPath = "/wrangler/";
			for (const exception of event.data.exception?.values ?? []) {
				for (const frame of exception.stacktrace?.frames ?? []) {
					if (frame.module.startsWith("@mswjs")) {
						frame.module =
							"@mswjs.interceptors.src.interceptors.fetch:index.ts";
					}
					if (frame.filename === undefined) {
						continue;
					}

					const wranglerPackageIndex = frame.filename.indexOf(
						path.join("packages", "wrangler", "src")
					);
					if (wranglerPackageIndex === -1) {
						continue;
					}
					frame.filename =
						fakeInstallPath +
						frame.filename
							.substring(wranglerPackageIndex)
							.replaceAll("\\", "/");
					continue;
				}
			}

			// If more data is included in the Sentry request, we'll need to verify it
			// couldn't contain PII and update this snapshot
			expect(event).toStrictEqual({
				data: {
					breadcrumbs: [
						{
							level: "log",
							message: "wrangler whoami",
							timestamp: 0,
						},
					],
					contexts: {
						app: {
							app_memory: 0,
							app_start_time: "",
						},
						cloud_resource: {},
						device: {},
						os: {},
						runtime: {
							name: "node",
							version: "",
						},
						trace: {
							span_id: "",
							trace_id: "",
						},
					},
					environment: "production",
					event_id: "",
					exception: {
						values: [
							{
								mechanism: {
									handled: true,
									type: "generic",
								},
								stacktrace: {
									frames: [
										{
											colno: 0,
											context_line: "",
											filename: expect.any(String),
											function: "",
											in_app: false,
											lineno: 0,
											module: expect.any(String),
											post_context: [],
											pre_context: [],
										},
										{
											colno: 0,
											context_line: "",
											filename: expect.any(String),
											function: "",
											in_app: false,
											lineno: 0,
											module: expect.any(String),
											post_context: [],
											pre_context: [],
										},
										{
											colno: 0,
											context_line: "",
											filename: expect.any(String),
											function: "",
											in_app: false,
											lineno: 0,
											module: expect.any(String),
											post_context: [],
											pre_context: [],
										},
										{
											colno: 0,
											context_line: "",
											filename: expect.any(String),
											function: "",
											in_app: false,
											lineno: 0,
											module: expect.any(String),
											post_context: [],
											pre_context: [],
										},
										{
											colno: 0,
											context_line: "",
											filename: expect.any(String),
											function: "",
											in_app: false,
											lineno: 0,
											module: expect.any(String),
											post_context: [],
											pre_context: [],
										},
										{
											colno: 0,
											context_line: "",
											filename: expect.any(String),
											function: "",
											in_app: false,
											lineno: 0,
											module: expect.any(String),
											post_context: [],
											pre_context: [],
										},
										{
											colno: 0,
											context_line: "",
											filename: expect.any(String),
											function: "",
											in_app: false,
											lineno: 0,
											module: expect.any(String),
											post_context: [],
											pre_context: [],
										},
										{
											colno: 0,
											context_line: "",
											filename: expect.any(String),
											function: "",
											in_app: false,
											lineno: 0,
											module: expect.any(String),
											post_context: [],
											pre_context: [],
										},
										{
											colno: 0,
											context_line: "",
											filename: "/project/...",
											function: "",
											in_app: false,
											lineno: 0,
											module:
												"@mswjs.interceptors.src.interceptors.fetch:index.ts",
											post_context: [],
											pre_context: [],
										},
										{
											colno: 0,
											context_line: "",
											filename: "/project/...",
											function: "",
											in_app: false,
											lineno: 0,
											module:
												"@mswjs.interceptors.src.interceptors.fetch:index.ts",
											post_context: [],
											pre_context: [],
										},
									],
								},
								type: "TypeError",
								value: "Failed to fetch",
							},
						],
					},
					modules: {},
					platform: "node",
					release: "",
					sdk: {
						integrations: [
							"InboundFilters",
							"FunctionToString",
							"LinkedErrors",
							"Console",
							"OnUncaughtException",
							"OnUnhandledRejection",
							"ContextLines",
							"Context",
							"Modules",
						],
						name: "sentry.javascript.node",
						packages: [
							{
								name: "npm:@sentry/node",
								version: "7.87.0",
							},
						],
						version: "7.87.0",
					},
					timestamp: 0,
				},
				header: {
					event_id: "",
					sdk: {
						name: "sentry.javascript.node",
						version: "7.87.0",
					},
					sent_at: "",
					trace: {
						environment: "production",
						public_key: "9edbb8417b284aa2bbead9b4c318918b",
						release: "",
						trace_id: "",
					},
				},
				type: {
					type: "event",
				},
			});
		});
	});
});

function mockSentryEndpoint() {
	const requests: EnvelopeRequest[] = [];
	msw.use(
		http.post(
			`https://platform.dash.cloudflare.com/sentry/envelope`,
			async ({ request }) => {
				requests.push((await request.json()) as EnvelopeRequest);
				return HttpResponse.json({}, { status: 200 });
			}
		)
	);

	return requests;
}
