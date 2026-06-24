import { setTimeout } from "node:timers/promises";
import {
	normalizeString,
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { Headers, Request } from "undici";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import MockWebSocketServer from "vitest-websocket-mock";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { MockWebSocket } from "./helpers/mock-web-socket";
import { createFetchResult, msw, mswSucessScriptHandlers } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";
import type {
	AlarmEvent,
	EmailEvent,
	QueueEvent,
	RequestEvent,
	RpcEvent,
	ScheduledEvent,
	TailEvent,
	TailEventMessage,
	TailEventMessageType,
	TailInfo,
} from "../tail/createTail";
import type { RequestInit } from "undici";
import type { ExpectStatic } from "vitest";
import type WebSocket from "ws";

vi.mock("ws", async (importOriginal) => {
	const realModule = await importOriginal<typeof import("ws")>();
	const module = {
		__esModule: true,
	};
	Object.defineProperties(module, {
		default: {
			get() {
				return MockWebSocket;
			},
		},
		WebSocket: {
			get() {
				return MockWebSocket;
			},
		},
		WebSocketServer: {
			get() {
				return realModule.WebSocketServer;
			},
		},
	});
	return module;
});

describe("tail", () => {
	mockAccountId();
	mockApiToken();
	let api: MockAPI;
	// Tracks the currently running `wrangler tail` invocation so we can wait
	// for it to fully unwind in afterEach (the handler now returns a blocking
	// lifecycle promise that resolves on a clean stop or rejects on give-up).
	let activeTailPromise: Promise<unknown> | undefined;

	afterEach(async () => {
		await api?.closeHelper?.();
		if (activeTailPromise) {
			try {
				await activeTailPromise;
			} catch {
				// Tests that expected a rejection have already asserted on it.
			}
			activeTailPromise = undefined;
		}
		mockWebSockets.forEach((ws) => ws.close());
		mockWebSockets = [];
		clearDialogs();
	});

	beforeEach(() => msw.use(...mswSucessScriptHandlers));
	runInTempDir();

	const std = mockConsoleMethods();

	/**
	 * Start a `wrangler tail` invocation and wait for it to be connected to
	 * the mock websocket server.
	 *
	 * The new tail handler blocks until a clean shutdown (server close with
	 * code 1000) or rejects after reconnect-exhaustion, so tests must NOT
	 * await `runWrangler("tail …")` directly. Instead, use this helper to
	 * fire off the command and wait for the connection to be established;
	 * the returned promise can be awaited at the end of the test after
	 * triggering a clean shutdown via `api.closeHelper()` (or relied on the
	 * `afterEach` to clean it up).
	 */
	async function startTail(
		cmd: string
	): Promise<{ tailPromise: Promise<unknown> }> {
		if (!api) {
			throw new Error("api must be initialized before startTail()");
		}
		const tailPromise = runWrangler(cmd);
		activeTailPromise = tailPromise;
		await api.ws.connected;
		// Wrap in an object so the caller's `await startTail()` doesn't
		// implicitly chain onto the still-pending `tailPromise` (which only
		// resolves on clean shutdown).
		return { tailPromise };
	}

	/**
	 * Wait for the handler to finish its post-connect setup so that the
	 * "Connected to <worker>" log is present in `std.out` before asserting
	 * on pretty-format snapshots.
	 */
	async function waitForPrettyConnected(expect: ExpectStatic): Promise<void> {
		await vi.waitFor(() => {
			expect(std.out).toContain("waiting for logs");
		});
	}

	/**
	 * Drive vitest's fake timers forward in small steps until the supplied
	 * promise settles, or a hard iteration cap is hit.
	 *
	 * The reconnect chain schedules a fresh `setTimeout` (the next attempt's
	 * back-off) inside the callback of the previous one, and vitest's
	 * `advanceTimersByTimeAsync` only fires timers that were already on the
	 * queue at the start of the call. Stepping the clock in small chunks
	 * lets newly scheduled timers be picked up on the next iteration and
	 * keeps microtasks (HTTP responses, promise rejections from the
	 * open-wait) interleaved between firings.
	 */
	async function advanceFakeTimersUntilSettled(
		promise: Promise<unknown>,
		maxIterations: number = 500
	): Promise<void> {
		let settled = false;
		void promise.then(
			() => {
				settled = true;
			},
			() => {
				settled = true;
			}
		);
		for (let i = 0; i < maxIterations && !settled; i++) {
			// `advanceTimersToNextTimerAsync` jumps to the next pending fake
			// timer and fires it, which lets the reconnect chain unwind one
			// step at a time without us having to guess the right delay.
			await vi.advanceTimersToNextTimerAsync();
		}
	}

	/**
	 * Interaction with the tailing API, including tail creation,
	 * deletion, and connection.
	 */
	describe("API interaction", () => {
		it("should throw an error if name isn't provided", async ({ expect }) => {
			await expect(
				runWrangler("tail")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Required Worker name missing. Please specify the Worker name in your Wrangler configuration file, or pass it as an argument with \`wrangler tail <worker-name>\`]`
			);
		});

		it("creates and then delete tails", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			expect(api.requests.creation.length).toStrictEqual(0);

			const { tailPromise } = await startTail("tail test-worker");

			expect(api.requests.creation.length).toStrictEqual(1);
			expect(api.requests.deletion.count).toStrictEqual(0);

			await api.closeHelper();
			await tailPromise;
			expect(api.requests.deletion.count).toStrictEqual(1);
		});

		it("should connect to the worker assigned to a given route", async ({
			expect,
		}) => {
			api = mockWebsocketAPIs(expect);
			expect(api.requests.creation.length).toStrictEqual(0);

			msw.use(
				http.get(
					`*/zones`,
					({ request }) => {
						const url = new URL(request.url);

						expect(url.searchParams.get("name")).toBe("example.com");
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: [{ id: "test-zone" }],
							},
							{ status: 200 }
						);
					},
					{ once: true }
				)
			);
			msw.use(
				http.get(
					`*/zones/:zoneId/workers/routes`,
					() => {
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: [
									{
										pattern: "example.com/*",
										script: "test-worker",
									},
								],
							},
							{ status: 200 }
						);
					},
					{ once: true }
				)
			);
			const { tailPromise } = await startTail("tail example.com/*");

			expect(api.requests.creation.length).toStrictEqual(1);
			expect(api.requests.deletion.count).toStrictEqual(0);

			await api.closeHelper();
			await tailPromise;
			expect(api.requests.deletion.count).toStrictEqual(1);
		});

		it("should error if a given route is not assigned to the user's zone", async ({
			expect,
		}) => {
			msw.use(
				http.get(
					`*/zones`,
					({ request }) => {
						const url = new URL(request.url);

						expect(url.searchParams.get("name")).toBe("example.com");
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: [{ id: "test-zone" }],
							},
							{ status: 200 }
						);
					},
					{ once: true }
				)
			);
			msw.use(
				http.get(
					`*/zones/:zoneId/workers/routes`,
					() => {
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: [],
							},
							{ status: 200 }
						);
					},
					{ once: true }
				)
			);

			await expect(runWrangler("tail example.com/*")).rejects.toThrow();
		});
		it("should error if a given route is not within the user's zone", async ({
			expect,
		}) => {
			msw.use(
				http.get(
					`*/zones`,
					({ request }) => {
						const url = new URL(request.url);

						expect(url.searchParams.get("name")).toBe("example.com");
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: [],
							},
							{ status: 200 }
						);
					},
					{ once: true }
				)
			);

			await expect(runWrangler("tail example.com/*")).rejects.toThrow();
		});

		it("creates and then delete tails: legacy envs", async ({ expect }) => {
			api = mockWebsocketAPIs(expect, "some-env", false);
			expect(api.requests.creation.length).toStrictEqual(0);

			const { tailPromise } = await startTail(
				"tail test-worker --env some-env --legacy-env true"
			);

			expect(api.requests.creation.length).toStrictEqual(1);
			expect(api.requests.deletion.count).toStrictEqual(0);

			await api.closeHelper();
			await tailPromise;
			expect(api.requests.deletion.count).toStrictEqual(1);
		});

		it("creates and then delete tails: service envs", async ({ expect }) => {
			api = mockWebsocketAPIs(expect, "some-env");
			expect(api.requests.creation.length).toStrictEqual(0);

			const { tailPromise } = await startTail(
				"tail test-worker --env some-env --legacy-env false"
			);

			expect(api.requests.creation.length).toStrictEqual(1);
			expect(api.requests.deletion.count).toStrictEqual(0);

			await api.closeHelper();
			await tailPromise;
			expect(api.requests.deletion.count).toStrictEqual(1);
		});

		it("activates debug mode when the cli arg is passed in", async ({
			expect,
		}) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail("tail test-worker --debug");
			await expect(api.nextMessageJson()).resolves.toHaveProperty(
				"debug",
				true
			);
			await api.closeHelper();
			await tailPromise;
		});
	});

	describe("filtering", () => {
		it("sends sampling rate filters", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const tooHigh = runWrangler("tail test-worker --sampling-rate 10");
			await expect(tooHigh).rejects.toThrow();

			const tooLow = runWrangler("tail test-worker --sampling-rate -5");
			await expect(tooLow).rejects.toThrow();

			const { tailPromise } = await startTail(
				"tail test-worker --sampling-rate 0.25"
			);

			expect(api.requests.creation[0]).toEqual({
				filters: [{ sampling_rate: 0.25 }],
			});
			await api.closeHelper();
			await tailPromise;
		});

		it("sends single status filters", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail(
				"tail test-worker --status error"
			);
			expect(api.requests.creation[0]).toEqual({
				filters: [
					{
						outcome: ["exception", "exceededCpu", "exceededMemory", "unknown"],
					},
				],
			});
			await api.closeHelper();
			await tailPromise;
		});

		it("sends multiple status filters", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail(
				"tail test-worker --status error --status canceled"
			);
			expect(api.requests.creation[0]).toEqual({
				filters: [
					{
						outcome: [
							"exception",
							"exceededCpu",
							"exceededMemory",
							"unknown",
							"canceled",
						],
					},
				],
			});
			await api.closeHelper();
			await tailPromise;
		});

		it("sends single HTTP method filters", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail("tail test-worker --method POST");
			expect(api.requests.creation[0]).toEqual({
				filters: [{ method: ["POST"] }],
			});
			await api.closeHelper();
			await tailPromise;
		});

		it("sends multiple HTTP method filters", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail(
				"tail test-worker --method POST --method GET"
			);
			expect(api.requests.creation[0]).toEqual({
				filters: [{ method: ["POST", "GET"] }],
			});
			await api.closeHelper();
			await tailPromise;
		});

		it("sends header filters without a query", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail(
				"tail test-worker --header X-CUSTOM-HEADER"
			);
			expect(api.requests.creation[0]).toEqual({
				filters: [{ header: { key: "X-CUSTOM-HEADER" } }],
			});
			await api.closeHelper();
			await tailPromise;
		});

		it("sends header filters with a query", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail(
				"tail test-worker --header X-CUSTOM-HEADER:some-value"
			);
			expect(api.requests.creation[0]).toEqual({
				filters: [{ header: { key: "X-CUSTOM-HEADER", query: "some-value" } }],
			});
			await api.closeHelper();
			await tailPromise;
		});

		it("sends single IP filters", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const fakeIp = "192.0.2.1";

			const { tailPromise } = await startTail(
				`tail test-worker --ip ${fakeIp}`
			);
			expect(api.requests.creation[0]).toEqual({
				filters: [{ client_ip: [fakeIp] }],
			});
			await api.closeHelper();
			await tailPromise;
		});

		it("sends multiple IP filters", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const fakeIp = "192.0.2.1";

			const { tailPromise } = await startTail(
				`tail test-worker --ip ${fakeIp} --ip self`
			);
			expect(api.requests.creation[0]).toEqual({
				filters: [{ client_ip: [fakeIp, "self"] }],
			});
			await api.closeHelper();
			await tailPromise;
		});

		it("sends search filters", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const search = "filterMe";

			const { tailPromise } = await startTail(
				`tail test-worker --search ${search}`
			);
			expect(api.requests.creation[0]).toEqual({
				filters: [{ query: search }],
			});
			await api.closeHelper();
			await tailPromise;
		});

		it("sends version id filters", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const versionId = "87501bef-3ef2-4464-a3d6-35e548695742";

			const { tailPromise } = await startTail(
				`tail test-worker --version-id ${versionId}`
			);
			expect(api.requests.creation[0]).toEqual({
				filters: [{ scriptVersion: versionId }],
			});
			await api.closeHelper();
			await tailPromise;
		});

		it("sends everything but the kitchen sink", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const sampling_rate = 0.69;
			const status = ["ok", "error"];
			const method = ["GET", "POST", "PUT"];
			const header = "X-HELLO:world";
			const client_ip = ["192.0.2.1", "self"];
			const query = "onlyTheseMessagesPlease";
			const versionId = "87501bef-3ef2-4464-a3d6-35e548695742";

			const cliFilters =
				`--sampling-rate ${sampling_rate} ` +
				status.map((s) => `--status ${s} `).join("") +
				method.map((m) => `--method ${m} `).join("") +
				`--header ${header} ` +
				client_ip.map((c) => `--ip ${c} `).join("") +
				`--search ${query} ` +
				`--version-id ${versionId} ` +
				`--debug`;

			const expectedWebsocketMessage = {
				filters: [
					{ sampling_rate: 0.69 },
					{
						outcome: [
							"ok",
							"exception",
							"exceededCpu",
							"exceededMemory",
							"unknown",
						],
					},
					{ method: ["GET", "POST", "PUT"] },
					{ header: { key: "X-HELLO", query: "world" } },
					{ client_ip: ["192.0.2.1", "self"] },
					{ query: "onlyTheseMessagesPlease" },
					{ scriptVersion: versionId },
				],
			};

			const { tailPromise } = await startTail(`tail test-worker ${cliFilters}`);
			expect(api.requests.creation[0]).toEqual(expectedWebsocketMessage);
			await api.closeHelper();
			await tailPromise;
		});
	});

	describe("printing", () => {
		const { setIsTTY } = useMockIsTTY();

		it("logs request messages in JSON format", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail("tail test-worker --format json");

			const event = generateMockRequestEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
			await tailPromise;
		});

		it("logs scheduled messages in JSON format", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail("tail test-worker --format json");

			const event = generateMockScheduledEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
			await tailPromise;
		});

		it("logs alarm messages in json format", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail("tail test-worker --format json");

			const event = generateMockAlarmEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
			await tailPromise;
		});

		it("logs email messages in json format", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail("tail test-worker --format json");

			const event = generateMockEmailEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
			await tailPromise;
		});

		it("logs tail messages in json format", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail("tail test-worker --format json");

			const event = generateMockTailEvent(["some-worker", "some-worker"]);
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
			await tailPromise;
		});

		it("logs queue messages in json format", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail("tail test-worker --format json");

			const event = generateMockQueueEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
			await tailPromise;
		});

		it("logs request messages in pretty format", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail(
				"tail test-worker --format pretty"
			);
			await waitForPrettyConnected(expect);

			const event = generateMockRequestEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(
				std.out
					.replace(
						new Date(mockEventTimestamp).toLocaleString(),
						"[mock event timestamp]"
					)
					.replace(mockTailExpiration.toISOString(), "[mock expiration date]")
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Successfully created tail, expires at [mock expiration date]
				Connected to test-worker, waiting for logs...
				GET https://example.org/ - Ok @ [mock event timestamp]"
			`);
			await api.closeHelper();
			await tailPromise;
		});

		it("logs rpc messages in pretty format", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail(
				"tail test-worker --format pretty"
			);
			await waitForPrettyConnected(expect);

			const event = generateMockRpcEvent();
			const message = generateMockEventMessage({
				entrypoint: "MyDurableObject",
				event,
			});
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(
				std.out
					.replace(
						new Date(mockEventTimestamp).toLocaleString(),
						"[mock event timestamp]"
					)
					.replace(mockTailExpiration.toISOString(), "[mock expiration date]")
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Successfully created tail, expires at [mock expiration date]
				Connected to test-worker, waiting for logs...
				MyDurableObject.foo - Ok @ [mock event timestamp]"
			`);
			await api.closeHelper();
			await tailPromise;
		});

		it("logs scheduled messages in pretty format", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail(
				"tail test-worker --format pretty"
			);
			await waitForPrettyConnected(expect);

			const event = generateMockScheduledEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(
				std.out
					.replace(
						new Date(mockEventTimestamp).toLocaleString(),
						"[mock timestamp string]"
					)
					.replace(mockTailExpiration.toISOString(), "[mock expiration date]")
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Successfully created tail, expires at [mock expiration date]
				Connected to test-worker, waiting for logs...
				"* * * * *" @ [mock timestamp string] - Ok"
			`);
			await api.closeHelper();
			await tailPromise;
		});

		it("logs alarm messages in pretty format", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail(
				"tail test-worker --format pretty"
			);
			await waitForPrettyConnected(expect);

			const event = generateMockAlarmEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(
				std.out
					.replace(
						new Date(mockEventScheduledTime).toLocaleString(),
						"[mock scheduled time]"
					)
					.replace(mockTailExpiration.toISOString(), "[mock expiration date]")
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Successfully created tail, expires at [mock expiration date]
				Connected to test-worker, waiting for logs...
				Alarm @ [mock scheduled time] - Ok"
			`);
			await api.closeHelper();
			await tailPromise;
		});

		it("logs email messages in pretty format", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail(
				"tail test-worker --format pretty"
			);
			await waitForPrettyConnected(expect);

			const event = generateMockEmailEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(
				std.out
					.replace(
						new Date(mockEventTimestamp).toLocaleString(),
						"[mock event timestamp]"
					)
					.replace(mockTailExpiration.toISOString(), "[mock expiration date]")
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Successfully created tail, expires at [mock expiration date]
				Connected to test-worker, waiting for logs...
				Email from:from@example.com to:to@example.com size:45416 @ [mock event timestamp] - Ok"
			`);
			await api.closeHelper();
			await tailPromise;
		});

		it("logs tail messages in pretty format", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail(
				"tail test-worker --format pretty"
			);
			await waitForPrettyConnected(expect);

			const event = generateMockTailEvent(["some-worker", "other-worker", ""]);
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(
				std.out
					.replace(
						new Date(mockEventTimestamp).toLocaleString(),
						"[mock event timestamp]"
					)
					.replace(
						new Date(mockTailExpiration).toISOString(),
						"[mock expiration date]"
					)
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Successfully created tail, expires at [mock expiration date]
				Connected to test-worker, waiting for logs...
				Tailing some-worker,other-worker - Ok @ [mock event timestamp]"
			`);
			await api.closeHelper();
			await tailPromise;
		});

		it("logs tail overload message", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail(
				"tail test-worker --format pretty"
			);
			await waitForPrettyConnected(expect);

			let event = generateTailInfo(true);
			let message = generateMockEventMessage({ event });
			let serializedMessage = serialize(message);
			api.ws.send(serializedMessage);

			event = generateTailInfo(false);
			message = generateMockEventMessage({ event });
			serializedMessage = serialize(message);
			api.ws.send(serializedMessage);
			expect(
				std.out.replace(
					mockTailExpiration.toISOString(),
					"[mock expiration date]"
				)
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Successfully created tail, expires at [mock expiration date]
				Connected to test-worker, waiting for logs...
				Tail is currently in sampling mode due to the high volume of messages. To prevent messages from being dropped consider adding filters.
				Tail has exited sampling mode and is no longer dropping messages."
			`);
			await api.closeHelper();
			await tailPromise;
		});

		it("logs queue messages in pretty format", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail(
				"tail test-worker --format pretty"
			);
			await waitForPrettyConnected(expect);

			const event = generateMockQueueEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(
				std.out
					.replace(
						new Date(mockEventTimestamp).toLocaleString(),
						"[mock timestamp string]"
					)
					.replace(mockTailExpiration.toISOString(), "[mock expiration date]")
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Successfully created tail, expires at [mock expiration date]
				Connected to test-worker, waiting for logs...
				Queue my-queue123 (7 messages) - Ok @ [mock timestamp string]"
			`);
			await api.closeHelper();
			await tailPromise;
		});

		it("should not crash when the tail message has a void event", async ({
			expect,
		}) => {
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail(
				"tail test-worker --format pretty"
			);
			await waitForPrettyConnected(expect);

			const message = generateMockEventMessage({ event: null });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(
				std.out
					.replace(
						new Date(mockEventTimestamp).toLocaleString(),
						"[mock timestamp string]"
					)
					.replace(mockTailExpiration.toISOString(), "[mock expiration date]")
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Successfully created tail, expires at [mock expiration date]
				Connected to test-worker, waiting for logs...
				Unknown Event - Ok @ [mock timestamp string]"
			`);
			await api.closeHelper();
			await tailPromise;
		});

		it("defaults to logging in pretty format when the output is a TTY", async ({
			expect,
		}) => {
			setIsTTY(true);
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail("tail test-worker");
			await waitForPrettyConnected(expect);

			const event = generateMockRequestEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(
				std.out
					.replace(
						new Date(mockEventTimestamp).toLocaleString(),
						"[mock event timestamp]"
					)
					.replace(mockTailExpiration.toISOString(), "[mock expiration date]")
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Successfully created tail, expires at [mock expiration date]
				Connected to test-worker, waiting for logs...
				GET https://example.org/ - Ok @ [mock event timestamp]"
			`);
			await api.closeHelper();
			await tailPromise;
		});

		it("defaults to logging in json format when the output is not a TTY", async ({
			expect,
		}) => {
			setIsTTY(false);

			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail("tail test-worker");

			const event = generateMockRequestEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
			await tailPromise;
		});

		it("logs console messages and exceptions", async ({ expect }) => {
			setIsTTY(true);
			api = mockWebsocketAPIs(expect);
			const { tailPromise } = await startTail("tail test-worker");
			await waitForPrettyConnected(expect);

			const event = generateMockRequestEvent();
			const message = generateMockEventMessage({
				event,
				logs: [
					{ message: ["some string"], level: "log", timestamp: 1234561 },
					{
						message: [{ complex: "object" }],
						level: "log",
						timestamp: 1234562,
					},
					{ message: [1234], level: "error", timestamp: 1234563 },
				],
				exceptions: [
					{
						name: "Error",
						message: "some error",
						timestamp: 1234564,
						stack: "  at Object.foo (file.js:1:2)",
					},
					{
						name: "Error",
						message: "some error without stack trace",
						timestamp: 1234564,
					},
					{
						name: "Error",
						message: { complex: "error" },
						timestamp: 1234564,
						stack: "  at Object.foo (file.js:1:2)",
					},
				],
			});
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(
				std.out
					.replace(
						new Date(mockEventTimestamp).toLocaleString(),
						"[mock event timestamp]"
					)
					.replace(mockTailExpiration.toISOString(), "[mock expiration date]")
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Successfully created tail, expires at [mock expiration date]
				Connected to test-worker, waiting for logs...
				GET https://example.org/ - Ok @ [mock event timestamp]
				  (log) some string
				  (log) { complex: 'object' }
				  (error) 1234"
			`);
			expect(normalizeString(std.err)).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mError: some error[0m

				    at Object.foo (file.js:1:2)


				[31mX [41;31m[[41;97mERROR[41;31m][0m [1mError: some error without stack trace[0m


				[31mX [41;31m[[41;97mERROR[41;31m][0m [1mError: { complex: 'error' }[0m

				    at Object.foo (file.js:1:2)

				"
			`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
			await api.closeHelper();
			await tailPromise;
		});
	});

	describe("disconnects", () => {
		it("errors when the websocket is already closed", async ({ expect }) => {
			api = mockWebsocketAPIs(expect);
			await api.closeHelper();

			await expect(runWrangler("tail test-worker")).rejects.toThrow();
			await api.closeHelper();
		});

		it("retries then gives up after the connection drops (pretty format)", async ({
			expect,
		}) => {
			api = mockWebsocketAPIs(expect);
			// The reconnect loop creates a fresh tail per attempt, so the
			// create/delete mocks need to fire more than once.
			mockReusableWebsocketAPIs(expect);

			// Snapshot signal listener counts so we can verify the give-up
			// path removes the SIGINT/SIGTERM handlers it registered
			// (regression guard: every other terminal path does this; the
			// give-up branch used to leak listeners).
			const sigintBefore = process.listenerCount("SIGINT");
			const sigtermBefore = process.listenerCount("SIGTERM");

			// Fake `setTimeout` from the very start so every timer the tail
			// command schedules — the initial WebSocket connection delay
			// (mock-socket's 4ms `delay()`), the per-attempt reconnect
			// back-offs (1/2/4/8/16s), and every failed-connection delay on
			// reconnect — lives in the fake queue. We can then drive the
			// whole 30-ish seconds of back-off in microtask time without
			// burning real wall-clock.
			vi.useFakeTimers({ toFake: ["setTimeout"] });

			const tailPromise = runWrangler(
				"tail test-worker --format=pretty"
			) as Promise<unknown>;
			activeTailPromise = tailPromise;

			// Set up the rejection assertion BEFORE driving any timers so the
			// give-up FatalError doesn't become an unhandled rejection.
			const assertion = expect(
				tailPromise
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Unable to reconnect to the tail for test-worker after 5 attempts. Please re-run \`wrangler tail test-worker\` to start a new session.]`
			);

			// Let the initial connection establish (mock-socket schedules a
			// 4ms fake setTimeout for the open event).
			await vi.advanceTimersByTimeAsync(50);
			await api.ws.connected;

			// Simulate an abnormal disconnect by closing the server with a
			// non-normal code. This dispatches close(code=1006) to the active
			// WebSocket and removes the server from the network bridge so
			// every reconnect `new WebSocket(url)` attempt fails with a
			// close-before-open — which is exactly the "give up after N
			// attempts" scenario we want to exercise.
			api.ws.close({ code: 1006, reason: "abnormal", wasClean: false });

			// Drive the reconnect chain forward in small steps so newly
			// scheduled timers (each attempt's failed-connection 4ms + the
			// next back-off sleep) are picked up by subsequent advances.
			// Bail as soon as the give-up rejection lands.
			await advanceFakeTimersUntilSettled(tailPromise);
			await assertion;

			expect(std.warn).toContain("Reconnecting (attempt 1 of 5)");
			expect(std.warn).toContain("Reconnecting (attempt 5 of 5)");

			vi.useRealTimers();

			// Give-up path must remove its SIGINT/SIGTERM listeners on the
			// way out.
			expect(process.listenerCount("SIGINT")).toBe(sigintBefore);
			expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore);
		});

		it("retries then gives up after the connection drops (json format)", async ({
			expect,
		}) => {
			api = mockWebsocketAPIs(expect);
			mockReusableWebsocketAPIs(expect);

			const sigintBefore = process.listenerCount("SIGINT");
			const sigtermBefore = process.listenerCount("SIGTERM");

			vi.useFakeTimers({ toFake: ["setTimeout"] });

			const tailPromise = runWrangler(
				"tail test-worker --format=json"
			) as Promise<unknown>;
			activeTailPromise = tailPromise;

			const assertion = expect(
				tailPromise
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: "Unable to reconnect to the tail for test-worker after 5 attempts. Please re-run \`wrangler tail test-worker\` to start a new session."]`
			);

			await vi.advanceTimersByTimeAsync(50);
			await api.ws.connected;

			api.ws.close({ code: 1006, reason: "abnormal", wasClean: false });

			await advanceFakeTimersUntilSettled(tailPromise);
			await assertion;

			vi.useRealTimers();

			expect(process.listenerCount("SIGINT")).toBe(sigintBefore);
			expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore);
		});

		it("auto-reconnects after a transient drop and continues streaming", async ({
			expect,
		}) => {
			api = mockWebsocketAPIs(expect);
			mockReusableWebsocketAPIs(expect);

			const { tailPromise } = await startTail(
				"tail test-worker --format=pretty"
			);
			await waitForPrettyConnected(expect);

			// Simulate a transient network drop on the current WebSocket by
			// dispatching a close event with an abnormal code directly on the
			// client. The server-side mock is left intact so the subsequent
			// reconnect attempt can succeed.
			const clients = (
				api.ws as unknown as {
					server: { clients(): MockWebSocket[] };
				}
			).server.clients();
			const firstClient = clients[clients.length - 1];
			firstClient.dispatchEvent({
				type: "close",
				code: 1006,
				reason: "transient drop",
				wasClean: false,
			} as unknown as Event);

			// Wait for the reconnect to succeed (up to ~5s including the 1s
			// backoff before the first reconnect attempt).
			await vi.waitFor(
				() => {
					expect(std.out).toContain("Reconnected to test-worker");
				},
				{ timeout: 5000 }
			);

			expect(std.warn).toContain("Reconnecting (attempt 1 of 5)");

			await api.closeHelper();
			await tailPromise;
		});
	});

	describe("shutdown", () => {
		it("logs `Stopping tail...`, deletes the tail, and exits cleanly on Ctrl-C", async ({
			expect,
		}) => {
			api = mockWebsocketAPIs(expect);

			// Capture SIGINT listeners present before the command runs so we
			// can identify (and invoke) the one the tail command registers.
			const before = new Set(process.listeners("SIGINT"));

			const { tailPromise } = await startTail(
				"tail test-worker --format=pretty"
			);
			await waitForPrettyConnected(expect);

			expect(api.requests.deletion.count).toStrictEqual(0);

			// The tail command must register a SIGINT handler. Regression
			// guard: a top-level `process.on("SIGINT")` elsewhere (previously
			// in pages/index.ts) used to `process.exit()` first and prevent
			// this handler from ever running.
			const added = process
				.listeners("SIGINT")
				.filter((listener) => !before.has(listener));
			expect(added.length).toBeGreaterThan(0);

			// Emit a real SIGINT so we exercise the same dispatch path a user's
			// Ctrl-C would. If a rogue module-level handler that calls
			// `process.exit()` is ever re-introduced ahead of ours, this would
			// hard-exit the worker and fail the run.
			process.emit("SIGINT");

			// The handler resolves the blocking lifecycle promise after a
			// clean shutdown.
			await tailPromise;

			expect(std.out).toContain("Stopping tail...");
			// The server-side tail was deleted as part of the clean shutdown.
			expect(api.requests.deletion.count).toStrictEqual(1);
		});

		it("shuts down cleanly when Ctrl-C is hit before the WebSocket finishes connecting", async ({
			expect,
		}) => {
			api = mockWebsocketAPIs(expect);

			// Fake `setTimeout` so we can hold the initial WebSocket
			// connection in its CONNECTING state — mock-socket schedules the
			// connection "open" dispatch via a 4 ms `delay()`, which we don't
			// advance until we've emitted SIGINT. The handler will therefore
			// be parked at `await new Promise(...)` for the open-wait when we
			// signal.
			vi.useFakeTimers({ toFake: ["setTimeout"] });

			const tailPromise = runWrangler(
				"tail test-worker --format=pretty"
			) as Promise<unknown>;
			activeTailPromise = tailPromise;

			// Wait until the handler has actually entered the open-wait
			// promise. Polling for `currentTail` from outside isn't possible,
			// so instead we wait for the mock WebSocket to be constructed
			// (visible to the server) AND for the close listener to be
			// attached on it (one of the last sync steps before the await).
			const server = (
				api.ws as unknown as {
					server: { clients(): { listeners: Record<string, unknown[]> }[] };
				}
			).server;
			for (let i = 0; i < 200; i++) {
				const clients = server.clients();
				if (clients.length > 0) {
					// MockWebSocket attaches listeners via `addEventListener`,
					// which pushes into `listeners["close"]`. mock-socket
					// itself does not add a default close listener, so once
					// this array is non-empty the handler has finished its
					// post-`createTail` sync setup and is parked at the
					// open-wait.
					if (clients[0].listeners?.close?.length) {
						break;
					}
				}
				await Promise.resolve();
			}

			// Emit SIGINT while the connection is still CONNECTING.
			// `shutdownHandler` will call `teardownCurrentConnection` →
			// `tail.terminate()`, which dispatches a `close` on the
			// not-yet-opened WebSocket. The close handler must recognise this
			// as an intentional close and resolve the open-wait (rather than
			// reject it with "Connection ... closed unexpectedly.").
			process.emit("SIGINT");

			// Advance fake timers so terminate's close dispatch (and any
			// other pending fake timers) fire.
			await vi.advanceTimersByTimeAsync(100);

			// Must resolve cleanly — *not* reject with "closed unexpectedly".
			await tailPromise;

			expect(std.out).toContain("Stopping tail...");
			expect(std.err).not.toContain("closed unexpectedly");

			vi.useRealTimers();
		});
	});

	it("should error helpfully if pages_build_output_dir is set in wrangler.toml", async ({
		expect,
	}) => {
		writeWranglerConfig({
			pages_build_output_dir: "public",
			name: "test-name",
		});
		await expect(
			runWrangler("tail")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`
			[Error: It looks like you've run a Workers-specific command in a Pages project.
			For Pages, please run \`wrangler pages deployment tail\` instead.]
		`
		);
	});
});

/* helpers */

/**
 * The built in serialize-to-JSON feature of our mock websocket doesn't work
 * for our use-case since we actually expect a raw buffer,
 * not a Javascript string. Additionally, we have to do some fiddling
 * with `RequestEvent`s to get them to serialize properly.
 *
 * @param message a message to serialize to JSON
 * @returns the same type we expect when deserializing in wrangler
 */
function serialize(message: TailEventMessage): WebSocket.RawData {
	if (!isRequest(message.event)) {
		// `ScheduledEvent`s and `TailEvent`s work just fine
		const stringified = JSON.stringify(message);
		return Buffer.from(stringified, "utf-8");
	} else {
		// Since the "properties" of an `undici.Request` are actually getters,
		// which don't serialize properly, we need to hydrate them manually.
		// This isn't a problem outside of testing since deserialization
		// works just fine and wrangler never _sends_ any event messages,
		// it only receives them.
		const request = ((message.event as RequestEvent | undefined | null) || {})
			.request;
		const stringified = JSON.stringify(message, (key, value) => {
			if (key !== "request") {
				return value;
			}

			return {
				...request,
				url: request?.url,
				headers: request?.headers,
				method: request?.method,
			};
		});

		return Buffer.from(stringified, "utf-8");
	}
}

/**
 * Small helper to disambiguate the event types possible in a `TailEventMessage`
 *
 * @param event A TailEvent
 * @returns true if `event` is a RequestEvent
 */
function isRequest(event: TailEventMessageType): event is RequestEvent {
	return Boolean(event && "request" in event);
}

/**
 * Similarly, we need to deserialize from a raw buffer instead
 * of just JSON.parsing a raw string.
 *
 * @param message a buffer of data received from the websocket
 * @returns a JSON object ready to be compared against
 */
function deserializeJsonMessage(message: WebSocket.RawData) {
	return JSON.parse(message.toString());
}

/**
 * A mock for all the different API resources wrangler accesses
 * when running `wrangler tail`
 */
type MockAPI = {
	requests: {
		creation: RequestInit[];
		deletion: RequestCounter;
	};
	ws: MockWebSocketServer;
	nextMessageJson(): Promise<unknown>;
	closeHelper: () => Promise<void>;
};

/**
 * A counter used to check how many times a mock API has been hit.
 * Useful as a helper in our testing to check if wrangler is making
 * the correct API calls without actually sending any web traffic
 */
type RequestCounter = {
	count: number;
};

/**
 * Mock out the API hit during Tail creation
 *
 * @param websocketURL a fake URL for wrangler to connect a websocket to
 * @returns a `RequestCounter` for counting how many times the API is hit
 */
function mockCreateTailRequest(
	expect: ExpectStatic,
	websocketURL: string,
	env?: string,
	useServiceEnvironments = true,
	expectedScriptName = !useServiceEnvironments && env
		? `test-worker-${env}`
		: "test-worker"
): RequestInit[] {
	const requests: RequestInit[] = [];
	const servicesOrScripts =
		env && useServiceEnvironments ? "services" : "scripts";
	const environment =
		env && useServiceEnvironments ? "/environments/:envName" : "";
	msw.use(
		http.post<
			{ accountId: string; scriptName: string; envName: string },
			RequestInit
		>(
			`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/tails`,
			async ({ params, request }) => {
				const r = await request.json();
				requests.push(r);
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual(expectedScriptName);
				if (useServiceEnvironments) {
					expect(params.envName).toEqual(env);
				}
				return HttpResponse.json(
					createFetchResult({
						url: websocketURL,
						id: "tail-id",
						expires_at: mockTailExpiration,
					})
				);
			},
			{ once: true }
		)
	);

	return requests;
}

/**
 * Mock expiration datetime for tails created during testing
 */
const mockTailExpiration = new Date(3005, 1);

/**
 * Default value for event timestamps
 */
const mockEventTimestamp = 1645454470467;

/**
 * Default value for event time ISO strings
 */
const mockEventScheduledTime = new Date(mockEventTimestamp).toISOString();

/**
 * Default value for email event from
 */
const mockEmailEventFrom = "from@example.com";

/**
 * Default value for email event to
 */
const mockEmailEventTo = "to@example.com";

/**
 * Default value for email event mail size
 */
const mockEmailEventSize = 45416;

/**
 * Mock out the API hit during Tail deletion
 *
 * @returns a `RequestCounter` for counting how many times the API is hit
 */
function mockDeleteTailRequest(
	expect: ExpectStatic,
	env?: string,
	useServiceEnvironments = true,
	expectedScriptName = !useServiceEnvironments && env
		? `test-worker-${env}`
		: "test-worker"
): RequestCounter {
	const requests = { count: 0 };
	const servicesOrScripts =
		env && useServiceEnvironments ? "services" : "scripts";
	const environment =
		env && useServiceEnvironments ? "/environments/:envName" : "";
	msw.use(
		http.delete(
			`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/tails/:tailId`,
			async ({ params }) => {
				requests.count++;
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual(expectedScriptName);
				if (useServiceEnvironments) {
					if (env) {
						expect(params.tailId).toEqual("tail-id");
					}
				}
				expect(params.tailId).toEqual("tail-id");
				return HttpResponse.json(createFetchResult(null));
			}
		)
	);

	return requests;
}

let mockWebSockets: MockWebSocketServer[] = [];

/**
 * All-in-one convenience method to mock the appropriate API calls before
 * each test, and clean up afterwards.
 *
 * @param websocketURL a fake websocket URL for wrangler to connect to
 * @returns a mocked-out version of the API
 */
function mockWebsocketAPIs(
	expect: ExpectStatic,
	env?: string,
	useServiceEnvironments = true,
	expectedScriptName?: string
): MockAPI {
	const websocketURL = "ws://localhost:1234";
	const api: MockAPI = {
		requests: {
			deletion: { count: 0 },
			creation: [],
		},
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Initialized in beforeEach()
		ws: null!, // will be set in the `beforeEach()` below.

		/**
		 * Parse the next message received by the mock websocket as JSON
		 * @returns JSON.parse of the next message received by the websocket
		 */
		async nextMessageJson() {
			const message = await api.ws.nextMessage;
			return JSON.parse(message as string);
		},
		/**
		 * Close the mock websocket and clean up the API.
		 * The setTimeout forces a cycle to allow for closing and cleanup
		 * @returns a Promise that resolves when the websocket is closed
		 */
		async closeHelper() {
			api.ws.close();
			await setTimeout(0);
		},
	};
	api.requests.creation = mockCreateTailRequest(
		expect,
		websocketURL,
		env,
		useServiceEnvironments,
		expectedScriptName
	);
	api.requests.deletion = mockDeleteTailRequest(
		expect,
		env,
		useServiceEnvironments,
		expectedScriptName
	);
	api.ws = new MockWebSocketServer(websocketURL);
	mockWebSockets.push(api.ws);

	return api;
}

/**
 * Register additional create-tail mocks beyond the initial one set up by
 * {@link mockWebsocketAPIs}. The default MSW handler is `{ once: true }`, so
 * the reconnect path (which calls `createTail` again for each attempt)
 * would otherwise fail on the second tail creation.
 *
 * Call this in disconnect/reconnect tests so the handler can make
 * subsequent create-tail HTTP calls successfully.
 */
function mockReusableWebsocketAPIs(
	expect: ExpectStatic,
	count: number = 5
): void {
	for (let i = 0; i < count; i++) {
		mockCreateTailRequest(expect, "ws://localhost:1234");
	}
}

/**
 * Generate a mock `TailEventMessage` of the same shape sent back by the
 * tail worker.
 *
 * @param opts Any specific parts of the message to use instead of defaults
 * @returns a `TailEventMessage` that wrangler can process and display
 */
function generateMockEventMessage({
	outcome = "ok",
	entrypoint = undefined,
	exceptions = [],
	logs = [],
	eventTimestamp = mockEventTimestamp,
	event = generateMockRequestEvent(),
}: Partial<TailEventMessage>): TailEventMessage {
	return {
		outcome,
		entrypoint,
		exceptions,
		logs,
		eventTimestamp,
		event,
	};
}

/**
 * Generate a mock `RequestEvent` that, in an alternate timeline, was used
 * to trigger a worker. You can't disprove this!
 *
 * @param opts Any specific parts of the event to use instead of defaults
 * @returns a `RequestEvent` that can be used within an `EventMessage`
 */
function generateMockRequestEvent(
	opts?: Partial<RequestEvent["request"]>
): RequestEvent {
	return {
		request: Object.assign(
			new Request(opts?.url || "https://example.org/", {
				method: opts?.method || "GET",
				headers:
					opts?.headers || new Headers({ "X-EXAMPLE-HEADER": "some_value" }),
			}),
			{
				cf: opts?.cf || {
					tlsCipher: "AEAD-ENCRYPT-O-MATIC-SHA",
					tlsVersion: "TLSv2.0",
					asn: 42069,
					colo: "ATL",
					httpProtocol: "HTTP/4",
					asOrganization: "Cloudflare",
				},
			}
		),
	};
}

function generateMockScheduledEvent(
	opts?: Partial<ScheduledEvent>
): ScheduledEvent {
	return {
		cron: opts?.cron || "* * * * *",
		scheduledTime: opts?.scheduledTime || mockEventTimestamp,
	};
}

function generateMockAlarmEvent(opts?: Partial<AlarmEvent>): AlarmEvent {
	return {
		scheduledTime: opts?.scheduledTime || mockEventScheduledTime,
	};
}

function generateMockEmailEvent(opts?: Partial<EmailEvent>): EmailEvent {
	return {
		mailFrom: opts?.mailFrom || mockEmailEventFrom,
		rcptTo: opts?.rcptTo || mockEmailEventTo,
		rawSize: opts?.rawSize || mockEmailEventSize,
	};
}

function generateMockTailEvent(tailing: string[]): TailEvent {
	return {
		consumedEvents: tailing.map((tailedScript) => {
			return { scriptName: tailedScript };
		}),
	};
}

function generateTailInfo(overload: boolean): TailInfo {
	return overload
		? {
				message:
					"Tail is currently in sampling mode due to the high volume of messages. To prevent messages from being dropped consider adding filters.",
				type: "overload",
			}
		: {
				message:
					"Tail has exited sampling mode and is no longer dropping messages.",
				type: "overload-stop",
			};
}

function generateMockQueueEvent(opts?: Partial<QueueEvent>): QueueEvent {
	return {
		queue: opts?.queue || "my-queue123",
		batchSize: opts?.batchSize || 7,
	};
}

function generateMockRpcEvent(opts?: Partial<RpcEvent>): RpcEvent {
	return {
		rpcMethod: opts?.rpcMethod || "foo",
	};
}
