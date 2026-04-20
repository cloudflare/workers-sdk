import {
	mockCreateDate,
	mockStartDate,
} from "@cloudflare/workers-utils/test-helpers";
import ci from "ci-info";
import { http, HttpResponse } from "msw";
// eslint-disable-next-line no-restricted-imports
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockSelect } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type {
	BrowserAcquireResponse,
	BrowserCloseResponse,
	BrowserSession,
	BrowserTarget,
} from "../browser-rendering/types";

vi.mock("ci-info");

// Mock the open-in-browser module
vi.mock("../open-in-browser", () => ({
	default: vi.fn().mockResolvedValue(undefined),
}));

describe("wrangler browser", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();
	runInTempDir();
	mockAccountId();
	mockApiToken();

	afterEach(() => {
		clearDialogs();
	});

	const mockListSessions = (sessions: BrowserSession[]) => {
		msw.use(
			http.get(
				`*/accounts/:accountId/browser-rendering/devtools/session`,
				() => {
					// Browser Run API returns raw JSON, not wrapped in { success, result }
					return HttpResponse.json(sessions);
				},
				{ once: true }
			)
		);
	};

	const mockGetSessionTargets = (
		sessionId: string,
		targets: BrowserTarget[]
	) => {
		msw.use(
			http.get(
				`*/accounts/:accountId/browser-rendering/devtools/browser/${sessionId}/json`,
				() => {
					// Browser Run API returns raw JSON, not wrapped in { success, result }
					return HttpResponse.json(targets);
				},
				{ once: true }
			)
		);
	};

	describe("list", () => {
		it("should list active browser sessions", async () => {
			const sessions: BrowserSession[] = [
				{
					sessionId: "session-1",
					startTime: mockCreateDate.getTime(),
					connectionId: "conn-1",
					connectionStartTime: mockStartDate.getTime(),
				},
				{
					sessionId: "session-2",
					startTime: mockCreateDate.getTime(),
				},
			];
			mockListSessions(sessions);

			await runWrangler("browser list");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				┌─┬─┬─┬─┐
				│ Session ID │ Start Time │ Connection ID │ Connected At │
				├─┼─┼─┼─┤
				│ session-1 │ [mock-create-date] │ conn-1 │ [mock-start-date] │
				├─┼─┼─┼─┤
				│ session-2 │ [mock-create-date] │ - │ - │
				└─┴─┴─┴─┘"
			`);
		});

		it("should show message when no sessions found", async () => {
			mockListSessions([]);

			await runWrangler("browser list");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				No active Browser Run sessions found."
			`);
		});

		it("should output JSON when --json flag is used", async () => {
			const sessions: BrowserSession[] = [
				{
					sessionId: "session-1",
					startTime: 1234567890000,
				},
			];
			mockListSessions(sessions);

			await runWrangler("browser list --json");

			expect(std.out).toMatchInlineSnapshot(`
				"[
				    {
				        "sessionId": "session-1",
				        "startTime": 1234567890000
				    }
				]"
			`);
		});

		it("should output empty JSON array when --json flag is used with no sessions", async () => {
			mockListSessions([]);

			await runWrangler("browser list --json");

			expect(std.out).toMatchInlineSnapshot(`"[]"`);
		});
	});

	describe("view", () => {
		it("should open DevTools for a session with single target (interactive)", async () => {
			setIsTTY(true);
			vi.mocked(ci).isCI = false;

			const { default: openInBrowser } = await import("../open-in-browser");
			const targets: BrowserTarget[] = [
				{
					id: "page-1",
					type: "page",
					title: "about:blank",
					url: "about:blank",
					description: "",
					devtoolsFrontendUrl: "https://live.browser.run/ui/inspector?wss=...",
					webSocketDebuggerUrl: "wss://live.browser.run/api/devtools/...",
				},
			];
			mockGetSessionTargets("session-123", targets);

			await runWrangler("browser view session-123");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Opening live browser session "session-123"..."
			`);
			expect(openInBrowser).toHaveBeenCalledWith(
				"https://live.browser.run/ui/inspector?wss=..."
			);
		});

		it("should print URL only by default in non-interactive mode", async () => {
			const { default: openInBrowser } = await import("../open-in-browser");
			vi.mocked(openInBrowser).mockClear();
			const targets: BrowserTarget[] = [
				{
					id: "page-1",
					type: "page",
					title: "about:blank",
					url: "about:blank",
					description: "",
					devtoolsFrontendUrl: "https://live.browser.run/ui/inspector?wss=...",
					webSocketDebuggerUrl: "wss://live.browser.run/api/devtools/...",
				},
			];
			mockGetSessionTargets("session-ci", targets);

			await runWrangler("browser view session-ci");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				https://live.browser.run/ui/inspector?wss=..."
			`);
			expect(openInBrowser).not.toHaveBeenCalled();
		});

		it("should output JSON when --json flag is used with single target", async () => {
			const targets: BrowserTarget[] = [
				{
					id: "page-1",
					type: "page",
					title: "Test Page",
					url: "https://example.com",
					description: "",
					devtoolsFrontendUrl: "https://live.browser.run/ui/inspector?wss=abc",
					webSocketDebuggerUrl: "wss://live.browser.run/api/devtools/abc",
				},
			];
			mockGetSessionTargets("session-456", targets);

			await runWrangler("browser view session-456 --json");

			expect(std.out).toMatchInlineSnapshot(`
				"{
				    "id": "page-1",
				    "type": "page",
				    "title": "Test Page",
				    "url": "https://example.com",
				    "description": "",
				    "devtoolsFrontendUrl": "https://live.browser.run/ui/inspector?wss=abc",
				    "webSocketDebuggerUrl": "wss://live.browser.run/api/devtools/abc"
				}"
			`);
		});

		it("should throw error when no targets found", async () => {
			mockGetSessionTargets("invalid-session", []);

			await expect(
				runWrangler("browser view invalid-session")
			).rejects.toThrowError('No targets found for session "invalid-session"');
		});

		it("should prefer page targets over other types", async () => {
			setIsTTY(true);
			vi.mocked(ci).isCI = false;

			const { default: openInBrowser } = await import("../open-in-browser");
			const targets: BrowserTarget[] = [
				{
					id: "service-worker-1",
					type: "service_worker",
					title: "Service Worker",
					url: "",
					description: "",
					devtoolsFrontendUrl: "https://live.browser.run/sw-inspector",
					webSocketDebuggerUrl: "wss://live.browser.run/sw",
				},
				{
					id: "page-1",
					type: "page",
					title: "Main Page",
					url: "https://example.com",
					description: "",
					devtoolsFrontendUrl: "https://live.browser.run/page-inspector",
					webSocketDebuggerUrl: "wss://live.browser.run/page",
				},
			];
			mockGetSessionTargets("session-789", targets);

			await runWrangler("browser view session-789");

			expect(openInBrowser).toHaveBeenCalledWith(
				"https://live.browser.run/page-inspector"
			);
		});

		it("should print URL only when --no-open is used", async () => {
			const { default: openInBrowser } = await import("../open-in-browser");
			vi.mocked(openInBrowser).mockClear();
			const targets: BrowserTarget[] = [
				{
					id: "page-1",
					type: "page",
					title: "Test Page",
					url: "https://example.com",
					description: "",
					devtoolsFrontendUrl: "https://live.browser.run/ui/inspector?wss=...",
					webSocketDebuggerUrl: "wss://live.browser.run/api/devtools/...",
				},
			];
			mockGetSessionTargets("session-no-open", targets);

			await runWrangler("browser view session-no-open --no-open");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				https://live.browser.run/ui/inspector?wss=..."
			`);
			expect(openInBrowser).not.toHaveBeenCalled();
		});

		describe("multi-target selection", () => {
			beforeEach(() => {
				setIsTTY(true);
				vi.mocked(ci).isCI = false;
			});

			it("should prompt for selection when multiple page targets exist", async () => {
				const { default: openInBrowser } = await import("../open-in-browser");
				const targets: BrowserTarget[] = [
					{
						id: "page-1",
						type: "page",
						title: "Yahoo",
						url: "https://www.yahoo.com/",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/page-1",
						webSocketDebuggerUrl: "wss://live.browser.run/page-1",
					},
					{
						id: "page-2",
						type: "page",
						title: "Google",
						url: "https://www.google.com/",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/page-2",
						webSocketDebuggerUrl: "wss://live.browser.run/page-2",
					},
				];
				mockGetSessionTargets("session-multi", targets);
				mockSelect({
					text: "Multiple targets found. Select a target:",
					result: "page-2",
				});

				await runWrangler("browser view session-multi");

				expect(openInBrowser).toHaveBeenCalledWith(
					"https://live.browser.run/inspector/page-2"
				);
			});

			it("should error when multiple targets exist and no --target specified (non-interactive)", async () => {
				const targets: BrowserTarget[] = [
					{
						id: "page-1",
						type: "page",
						title: "Yahoo",
						url: "https://www.yahoo.com/",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/page-1",
						webSocketDebuggerUrl: "wss://live.browser.run/page-1",
					},
					{
						id: "page-2",
						type: "page",
						title: "Google",
						url: "https://www.google.com/",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/page-2",
						webSocketDebuggerUrl: "wss://live.browser.run/page-2",
					},
				];
				mockGetSessionTargets("session-multi-json", targets);

				await expect(
					runWrangler("browser view session-multi-json --json")
				).rejects.toThrow(
					"Multiple targets found. Use --target <selector> to specify which one."
				);
			});

			it("should select target by exact id match", async () => {
				const { default: openInBrowser } = await import("../open-in-browser");
				const targets: BrowserTarget[] = [
					{
						id: "DAB7FB6187B554E10B0BD18821265734",
						type: "page",
						title: "Yahoo",
						url: "https://www.yahoo.com/",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/yahoo",
						webSocketDebuggerUrl: "wss://live.browser.run/yahoo",
					},
					{
						id: "ABC123456789",
						type: "page",
						title: "Google",
						url: "https://www.google.com/",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/google",
						webSocketDebuggerUrl: "wss://live.browser.run/google",
					},
				];
				mockGetSessionTargets("session-id", targets);

				await runWrangler(
					"browser view session-id --target DAB7FB6187B554E10B0BD18821265734"
				);

				expect(openInBrowser).toHaveBeenCalledWith(
					"https://live.browser.run/inspector/yahoo"
				);
			});

			it("should select target by url substring match", async () => {
				const { default: openInBrowser } = await import("../open-in-browser");
				const targets: BrowserTarget[] = [
					{
						id: "page-1",
						type: "page",
						title: "Yahoo",
						url: "https://www.yahoo.com/",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/yahoo",
						webSocketDebuggerUrl: "wss://live.browser.run/yahoo",
					},
					{
						id: "page-2",
						type: "page",
						title: "Google",
						url: "https://www.google.com/",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/google",
						webSocketDebuggerUrl: "wss://live.browser.run/google",
					},
				];
				mockGetSessionTargets("session-url", targets);

				await runWrangler("browser view session-url --target google.com");

				expect(openInBrowser).toHaveBeenCalledWith(
					"https://live.browser.run/inspector/google"
				);
			});

			it("should select target by title substring match (case-insensitive)", async () => {
				const { default: openInBrowser } = await import("../open-in-browser");
				const targets: BrowserTarget[] = [
					{
						id: "page-1",
						type: "page",
						title: "Yahoo Mail",
						url: "https://mail.yahoo.com/",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/yahoo",
						webSocketDebuggerUrl: "wss://live.browser.run/yahoo",
					},
					{
						id: "page-2",
						type: "page",
						title: "Google Search",
						url: "https://www.google.com/",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/google",
						webSocketDebuggerUrl: "wss://live.browser.run/google",
					},
				];
				mockGetSessionTargets("session-title", targets);

				await runWrangler("browser view session-title --target YAHOO");

				expect(openInBrowser).toHaveBeenCalledWith(
					"https://live.browser.run/inspector/yahoo"
				);
			});

			it("should output single matched target as JSON when --target and --json used", async () => {
				const targets: BrowserTarget[] = [
					{
						id: "page-1",
						type: "page",
						title: "Yahoo",
						url: "https://www.yahoo.com/",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/yahoo",
						webSocketDebuggerUrl: "wss://live.browser.run/yahoo",
					},
					{
						id: "page-2",
						type: "page",
						title: "Google",
						url: "https://www.google.com/",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/google",
						webSocketDebuggerUrl: "wss://live.browser.run/google",
					},
				];
				mockGetSessionTargets("session-json", targets);

				await runWrangler("browser view session-json --target yahoo --json");

				expect(std.out).toMatchInlineSnapshot(`
					"{
					    "id": "page-1",
					    "type": "page",
					    "title": "Yahoo",
					    "url": "https://www.yahoo.com/",
					    "description": "",
					    "devtoolsFrontendUrl": "https://live.browser.run/inspector/yahoo",
					    "webSocketDebuggerUrl": "wss://live.browser.run/yahoo"
					}"
				`);
			});

			it("should throw error when --target matches no targets", async () => {
				const targets: BrowserTarget[] = [
					{
						id: "page-1",
						type: "page",
						title: "Yahoo",
						url: "https://www.yahoo.com/",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/yahoo",
						webSocketDebuggerUrl: "wss://live.browser.run/yahoo",
					},
				];
				mockGetSessionTargets("session-nomatch", targets);

				await expect(
					runWrangler("browser view session-nomatch --target bing")
				).rejects.toThrowError(
					'No target found matching "bing". Available targets:'
				);
			});

			it("should throw error when --target matches multiple targets", async () => {
				const targets: BrowserTarget[] = [
					{
						id: "page-1",
						type: "page",
						title: "Google Search",
						url: "https://www.google.com/search",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/search",
						webSocketDebuggerUrl: "wss://live.browser.run/search",
					},
					{
						id: "page-2",
						type: "page",
						title: "Google Maps",
						url: "https://www.google.com/maps",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/maps",
						webSocketDebuggerUrl: "wss://live.browser.run/maps",
					},
				];
				mockGetSessionTargets("session-ambig", targets);

				await expect(
					runWrangler("browser view session-ambig --target google")
				).rejects.toThrowError(
					'Multiple targets match "google". Please be more specific:'
				);
			});
		});

		describe("session auto-selection (no sessionId provided)", () => {
			it("should error when no sessions exist", async () => {
				mockListSessions([]);

				await expect(runWrangler("browser view")).rejects.toThrowError(
					"No active Browser Run sessions found. Use `wrangler browser create` to create one."
				);
			});

			it("should auto-select when only one session exists (interactive)", async () => {
				setIsTTY(true);
				vi.mocked(ci).isCI = false;

				const { default: openInBrowser } = await import("../open-in-browser");
				const sessions: BrowserSession[] = [
					{
						sessionId: "only-session",
						startTime: mockCreateDate.getTime(),
					},
				];
				const targets: BrowserTarget[] = [
					{
						id: "page-1",
						type: "page",
						title: "Test Page",
						url: "https://example.com",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/auto",
						webSocketDebuggerUrl: "wss://live.browser.run/auto",
					},
				];
				mockListSessions(sessions);
				mockGetSessionTargets("only-session", targets);

				await runWrangler("browser view");

				expect(std.out).toContain(
					`Opening live browser session "only-session"`
				);
				expect(openInBrowser).toHaveBeenCalledWith(
					"https://live.browser.run/inspector/auto"
				);
			});

			it("should prompt for selection when multiple sessions exist (interactive)", async () => {
				setIsTTY(true);
				vi.mocked(ci).isCI = false;

				const { default: openInBrowser } = await import("../open-in-browser");
				const sessions: BrowserSession[] = [
					{
						sessionId: "session-a",
						startTime: mockCreateDate.getTime(),
					},
					{
						sessionId: "session-b",
						startTime: mockStartDate.getTime(),
					},
				];
				const targets: BrowserTarget[] = [
					{
						id: "page-1",
						type: "page",
						title: "Test Page",
						url: "https://example.com",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/b",
						webSocketDebuggerUrl: "wss://live.browser.run/b",
					},
				];
				mockListSessions(sessions);
				mockSelect({
					text: "Select a session:",
					result: "session-b",
				});
				mockGetSessionTargets("session-b", targets);

				await runWrangler("browser view");

				expect(openInBrowser).toHaveBeenCalledWith(
					"https://live.browser.run/inspector/b"
				);
			});

			it("should error when multiple sessions exist and no session ID provided (non-interactive)", async () => {
				const sessions: BrowserSession[] = [
					{
						sessionId: "session-x",
						startTime: 1234567890000,
						connectionId: "conn-1",
						connectionStartTime: 1234567880000,
					},
					{
						sessionId: "session-y",
						startTime: 1234567800000,
					},
				];
				mockListSessions(sessions);

				await expect(runWrangler("browser view --json")).rejects.toThrow(
					"Multiple sessions found. Provide a session ID explicitly."
				);
			});
		});
	});

	describe("create", () => {
		const mockAcquireSession = (
			response: BrowserAcquireResponse,
			expectedParams?: {
				lab?: boolean;
				keepAlive?: number;
			}
		) => {
			msw.use(
				http.post(
					`*/accounts/:accountId/browser-rendering/devtools/browser`,
					({ request }) => {
						const url = new URL(request.url);

						// Verify expected query params
						expect(url.searchParams.get("targets")).toBe("true");
						if (expectedParams?.lab) {
							expect(url.searchParams.get("lab")).toBe("true");
						}
						if (expectedParams?.keepAlive) {
							expect(url.searchParams.get("keep_alive")).toBe(
								String(expectedParams.keepAlive * 1000)
							);
						}

						return HttpResponse.json(response);
					},
					{ once: true }
				)
			);
		};

		it("should create a session and open DevTools (interactive)", async () => {
			setIsTTY(true);
			vi.mocked(ci).isCI = false;

			const { default: openInBrowser } = await import("../open-in-browser");
			const response: BrowserAcquireResponse = {
				sessionId: "new-session-123",
				targets: [
					{
						id: "page-1",
						type: "page",
						title: "about:blank",
						url: "about:blank",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/new",
						webSocketDebuggerUrl: "wss://live.browser.run/new",
					},
				],
			};
			mockAcquireSession(response);

			await runWrangler("browser create");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Session created: new-session-123
				Opening DevTools..."
			`);
			expect(openInBrowser).toHaveBeenCalledWith(
				"https://live.browser.run/inspector/new"
			);
		});

		it("should not open browser by default in non-interactive mode", async () => {
			const { default: openInBrowser } = await import("../open-in-browser");
			vi.mocked(openInBrowser).mockClear();
			const response: BrowserAcquireResponse = {
				sessionId: "ci-session",
				targets: [
					{
						id: "page-1",
						type: "page",
						title: "about:blank",
						url: "about:blank",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/ci",
						webSocketDebuggerUrl: "wss://live.browser.run/ci",
					},
				],
			};
			mockAcquireSession(response);

			await runWrangler("browser create");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Session created: ci-session
				https://live.browser.run/inspector/ci"
			`);
			expect(openInBrowser).not.toHaveBeenCalled();
		});

		it("should not open browser when --no-open is used", async () => {
			const { default: openInBrowser } = await import("../open-in-browser");
			vi.mocked(openInBrowser).mockClear();
			const response: BrowserAcquireResponse = {
				sessionId: "no-open-session",
				targets: [
					{
						id: "page-1",
						type: "page",
						title: "about:blank",
						url: "about:blank",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/no-open",
						webSocketDebuggerUrl: "wss://live.browser.run/no-open",
					},
				],
			};
			mockAcquireSession(response);

			await runWrangler("browser create --no-open");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Session created: no-open-session
				https://live.browser.run/inspector/no-open"
			`);
			expect(openInBrowser).not.toHaveBeenCalled();
		});

		it("should pass --lab flag to API", async () => {
			const response: BrowserAcquireResponse = {
				sessionId: "lab-session-456",
				targets: [
					{
						id: "page-1",
						type: "page",
						title: "about:blank",
						url: "about:blank",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/lab",
						webSocketDebuggerUrl: "wss://live.browser.run/lab",
					},
				],
			};
			mockAcquireSession(response, { lab: true });

			await runWrangler("browser create --lab");

			expect(std.out).toContain("Session created: lab-session-456");
		});

		it("should pass --keepAlive flag to API (converted to ms)", async () => {
			const response: BrowserAcquireResponse = {
				sessionId: "keepalive-session",
				targets: [
					{
						id: "page-1",
						type: "page",
						title: "about:blank",
						url: "about:blank",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/ka",
						webSocketDebuggerUrl: "wss://live.browser.run/ka",
					},
				],
			};
			mockAcquireSession(response, { keepAlive: 300 });

			await runWrangler("browser create --keepAlive 300");

			expect(std.out).toContain("Session created: keepalive-session");
		});

		it("should output JSON when --json flag is used", async () => {
			const response: BrowserAcquireResponse = {
				sessionId: "json-session-789",
				targets: [
					{
						id: "page-1",
						type: "page",
						title: "Test Page",
						url: "https://example.com",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/inspector/json",
						webSocketDebuggerUrl: "wss://live.browser.run/json",
					},
				],
			};
			mockAcquireSession(response);

			await runWrangler("browser create --json");

			expect(std.out).toMatchInlineSnapshot(`
				"{
				    "sessionId": "json-session-789",
				    "targets": [
				        {
				            "id": "page-1",
				            "type": "page",
				            "title": "Test Page",
				            "url": "https://example.com",
				            "description": "",
				            "devtoolsFrontendUrl": "https://live.browser.run/inspector/json",
				            "webSocketDebuggerUrl": "wss://live.browser.run/json"
				        }
				    ]
				}"
			`);
		});

		it("should validate --keepAlive is within range (60-600)", async () => {
			await expect(
				runWrangler("browser create --keepAlive 30")
			).rejects.toThrow("--keep-alive must be between 60 and 600 seconds");

			await expect(
				runWrangler("browser create --keepAlive 700")
			).rejects.toThrow("--keep-alive must be between 60 and 600 seconds");
		});

		it("should throw error when no targets in response", async () => {
			const response: BrowserAcquireResponse = {
				sessionId: "empty-session",
				targets: [],
			};
			mockAcquireSession(response);

			await expect(runWrangler("browser create")).rejects.toThrowError(
				"Session created (empty-session) but no targets found"
			);
		});

		it("should prefer page targets over other types", async () => {
			setIsTTY(true);
			vi.mocked(ci).isCI = false;

			const { default: openInBrowser } = await import("../open-in-browser");
			const response: BrowserAcquireResponse = {
				sessionId: "multi-target-session",
				targets: [
					{
						id: "sw-1",
						type: "service_worker",
						title: "Service Worker",
						url: "",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/sw",
						webSocketDebuggerUrl: "wss://live.browser.run/sw",
					},
					{
						id: "page-1",
						type: "page",
						title: "Main Page",
						url: "https://example.com",
						description: "",
						devtoolsFrontendUrl: "https://live.browser.run/page",
						webSocketDebuggerUrl: "wss://live.browser.run/page",
					},
				],
			};
			mockAcquireSession(response);

			await runWrangler("browser create");

			expect(openInBrowser).toHaveBeenCalledWith(
				"https://live.browser.run/page"
			);
		});
	});

	describe("close", () => {
		const mockCloseSession = (
			sessionId: string,
			response: BrowserCloseResponse
		) => {
			msw.use(
				http.delete(
					`*/accounts/:accountId/browser-rendering/devtools/browser/${sessionId}`,
					() => {
						return HttpResponse.json(response);
					},
					{ once: true }
				)
			);
		};

		it("should close a session", async () => {
			mockCloseSession("session-to-close", { status: "closed" });

			await runWrangler("browser close session-to-close");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Session session-to-close closed."
			`);
		});

		it("should handle closing status", async () => {
			mockCloseSession("session-closing", { status: "closing" });

			await runWrangler("browser close session-closing");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Session session-closing closing."
			`);
		});

		it("should output JSON when --json flag is used", async () => {
			mockCloseSession("session-json-close", { status: "closed" });

			await runWrangler("browser close session-json-close --json");

			expect(std.out).toMatchInlineSnapshot(`
				"{
				    "sessionId": "session-json-close",
				    "status": "closed"
				}"
			`);
		});

		it("should throw error when session not found", async () => {
			msw.use(
				http.delete(
					`*/accounts/:accountId/browser-rendering/devtools/browser/nonexistent`,
					() => {
						return HttpResponse.json(
							{ error: "Session not found" },
							{ status: 404 }
						);
					},
					{ once: true }
				)
			);

			await expect(
				runWrangler("browser close nonexistent")
			).rejects.toThrowError("Browser Run API error: Session not found");
		});
	});
});
