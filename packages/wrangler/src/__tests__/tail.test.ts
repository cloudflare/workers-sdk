import { setTimeout } from "node:timers/promises";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { Headers, Request } from "undici";
/* eslint-disable workers-sdk/no-vitest-import-expect -- large file >500 lines */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import MockWebSocketServer from "vitest-websocket-mock";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { MockWebSocket } from "./helpers/mock-web-socket";
import { createFetchResult, msw, mswSucessScriptHandlers } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
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
import type WebSocket from "ws";

vi.mock("ws", async (importOriginal) => {
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports
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
	afterEach(async () => {
		await api?.closeHelper?.();
		mockWebSockets.forEach((ws) => ws.close());
		mockWebSockets = [];
		clearDialogs();
	});

	beforeEach(() => msw.use(...mswSucessScriptHandlers));
	runInTempDir();

	const std = mockConsoleMethods();

	/**
	 * Interaction with the tailing API, including tail creation,
	 * deletion, and connection.
	 */
	describe("API interaction", () => {
		it("should throw an error if name isn't provided", async () => {
			await expect(
				runWrangler("tail")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Required Worker name missing. Please specify the Worker name in your Wrangler configuration file, or pass it as an argument with \`wrangler tail <worker-name>\`]`
			);
		});

		it("creates and then delete tails", async () => {
			api = mockWebsocketAPIs();
			expect(api.requests.creation.length).toStrictEqual(0);

			await runWrangler("tail test-worker");

			await expect(api.ws.connected).resolves.toBeTruthy();
			expect(api.requests.creation.length).toStrictEqual(1);
			expect(api.requests.deletion.count).toStrictEqual(0);

			await api.closeHelper();
			expect(api.requests.deletion.count).toStrictEqual(1);
		});

		it("should connect to the worker assigned to a given route", async () => {
			api = mockWebsocketAPIs();
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
			await runWrangler("tail example.com/*");

			await expect(api.ws.connected).resolves.toBeTruthy();
			expect(api.requests.creation.length).toStrictEqual(1);
			expect(api.requests.deletion.count).toStrictEqual(0);

			await api.closeHelper();
			expect(api.requests.deletion.count).toStrictEqual(1);
		});

		it("should error if a given route is not assigned to the user's zone", async () => {
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
		it("should error if a given route is not within the user's zone", async () => {
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

		it("creates and then delete tails: legacy envs", async () => {
			api = mockWebsocketAPIs("some-env", false);
			expect(api.requests.creation.length).toStrictEqual(0);

			await runWrangler("tail test-worker --env some-env --legacy-env true");

			await expect(api.ws.connected).resolves.toBeTruthy();
			expect(api.requests.creation.length).toStrictEqual(1);
			expect(api.requests.deletion.count).toStrictEqual(0);

			await api.closeHelper();
			expect(api.requests.deletion.count).toStrictEqual(1);
		});

		it("creates and then delete tails: service envs", async () => {
			api = mockWebsocketAPIs("some-env");
			expect(api.requests.creation.length).toStrictEqual(0);

			await runWrangler("tail test-worker --env some-env --legacy-env false");

			await expect(api.ws.connected).resolves.toBeTruthy();
			expect(api.requests.creation.length).toStrictEqual(1);
			expect(api.requests.deletion.count).toStrictEqual(0);

			await api.closeHelper();
			expect(api.requests.deletion.count).toStrictEqual(1);
		});

		it("activates debug mode when the cli arg is passed in", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --debug");
			await expect(api.nextMessageJson()).resolves.toHaveProperty(
				"debug",
				true
			);
			await api.closeHelper();
		});
	});

	describe("filtering", () => {
		it("sends sampling rate filters", async () => {
			api = mockWebsocketAPIs();
			const tooHigh = runWrangler("tail test-worker --sampling-rate 10");
			await expect(tooHigh).rejects.toThrow();

			const tooLow = runWrangler("tail test-worker --sampling-rate -5");
			await expect(tooLow).rejects.toThrow();

			await runWrangler("tail test-worker --sampling-rate 0.25");

			expect(api.requests.creation[0]).toEqual({
				filters: [{ sampling_rate: 0.25 }],
			});
			await api.closeHelper();
		});

		it("sends single status filters", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --status error");
			expect(api.requests.creation[0]).toEqual({
				filters: [
					{
						outcome: ["exception", "exceededCpu", "exceededMemory", "unknown"],
					},
				],
			});
			await api.closeHelper();
		});

		it("sends multiple status filters", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --status error --status canceled");
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
		});

		it("sends single HTTP method filters", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --method POST");
			expect(api.requests.creation[0]).toEqual({
				filters: [{ method: ["POST"] }],
			});
			await api.closeHelper();
		});

		it("sends multiple HTTP method filters", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --method POST --method GET");
			expect(api.requests.creation[0]).toEqual({
				filters: [{ method: ["POST", "GET"] }],
			});
			await api.closeHelper();
		});

		it("sends header filters without a query", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --header X-CUSTOM-HEADER");
			expect(api.requests.creation[0]).toEqual({
				filters: [{ header: { key: "X-CUSTOM-HEADER" } }],
			});
			await api.closeHelper();
		});

		it("sends header filters with a query", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --header X-CUSTOM-HEADER:some-value");
			expect(api.requests.creation[0]).toEqual({
				filters: [{ header: { key: "X-CUSTOM-HEADER", query: "some-value" } }],
			});
			await api.closeHelper();
		});

		it("sends single IP filters", async () => {
			api = mockWebsocketAPIs();
			const fakeIp = "192.0.2.1";

			await runWrangler(`tail test-worker --ip ${fakeIp}`);
			expect(api.requests.creation[0]).toEqual({
				filters: [{ client_ip: [fakeIp] }],
			});
			await api.closeHelper();
		});

		it("sends multiple IP filters", async () => {
			api = mockWebsocketAPIs();
			const fakeIp = "192.0.2.1";

			await runWrangler(`tail test-worker --ip ${fakeIp} --ip self`);
			expect(api.requests.creation[0]).toEqual({
				filters: [{ client_ip: [fakeIp, "self"] }],
			});
			await api.closeHelper();
		});

		it("sends search filters", async () => {
			api = mockWebsocketAPIs();
			const search = "filterMe";

			await runWrangler(`tail test-worker --search ${search}`);
			expect(api.requests.creation[0]).toEqual({
				filters: [{ query: search }],
			});
			await api.closeHelper();
		});

		it("sends version id filters", async () => {
			api = mockWebsocketAPIs();
			const versionId = "87501bef-3ef2-4464-a3d6-35e548695742";

			await runWrangler(`tail test-worker --version-id ${versionId}`);
			expect(api.requests.creation[0]).toEqual({
				filters: [{ scriptVersion: versionId }],
			});
			await api.closeHelper();
		});

		it("sends everything but the kitchen sink", async () => {
			api = mockWebsocketAPIs();
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

			await runWrangler(`tail test-worker ${cliFilters}`);
			expect(api.requests.creation[0]).toEqual(expectedWebsocketMessage);
			await api.closeHelper();
		});
	});

	describe("printing", () => {
		const { setIsTTY } = useMockIsTTY();

		it("logs request messages in JSON format", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --format json");

			const event = generateMockRequestEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
		});

		it("logs scheduled messages in JSON format", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --format json");

			const event = generateMockScheduledEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
		});

		it("logs alarm messages in json format", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --format json");

			const event = generateMockAlarmEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
		});

		it("logs email messages in json format", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --format json");

			const event = generateMockEmailEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
		});

		it("logs tail messages in json format", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --format json");

			const event = generateMockTailEvent(["some-worker", "some-worker"]);
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
		});

		it("logs queue messages in json format", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --format json");

			const event = generateMockQueueEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
		});

		it("logs request messages in pretty format", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --format pretty");

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
		});

		it("logs rpc messages in pretty format", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --format pretty");

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
		});

		it("logs scheduled messages in pretty format", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --format pretty");

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
		});

		it("logs alarm messages in pretty format", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --format pretty");

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
		});

		it("logs email messages in pretty format", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --format pretty");

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
		});

		it("logs tail messages in pretty format", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --format pretty");

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
		});

		it("logs tail overload message", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --format pretty");

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
		});

		it("logs queue messages in pretty format", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --format pretty");

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
		});

		it("should not crash when the tail message has a void event", async () => {
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --format pretty");

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
		});

		it("defaults to logging in pretty format when the output is a TTY", async () => {
			setIsTTY(true);
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker");

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
		});

		it("defaults to logging in json format when the output is not a TTY", async () => {
			setIsTTY(false);

			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker");

			const event = generateMockRequestEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
		});

		it("logs console messages and exceptions", async () => {
			setIsTTY(true);
			api = mockWebsocketAPIs();
			await runWrangler("tail test-worker");

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
					{ name: "Error", message: "some error", timestamp: 1234564 },
					{ name: "Error", message: { complex: "error" }, timestamp: 1234564 },
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
			expect(std.err).toMatchInlineSnapshot(`
			        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1m  Error: some error[0m


			        [31mX [41;31m[[41;97mERROR[41;31m][0m [1m  Error: { complex: 'error' }[0m

			        "
		      `);
			expect(std.warn).toMatchInlineSnapshot(`""`);
			await api.closeHelper();
		});
	});

	describe("disconnects", () => {
		it("errors when the websocket is already closed", async () => {
			api = mockWebsocketAPIs();
			await api.closeHelper();

			await expect(runWrangler("tail test-worker")).rejects.toThrow();
			await api.closeHelper();
		});

		it("errors when the websocket stops reacting to pings (pretty format)", async () => {
			api = mockWebsocketAPIs();
			vi.useFakeTimers({
				toFake: ["setInterval"],
			});
			// Block the websocket from replying to the ping
			vi.spyOn(MockWebSocket.prototype, "ping").mockImplementation(() => {});
			await runWrangler("tail test-worker --format=pretty");
			await api.ws.connected;
			// The ping is sent every 2 secs, so it should not fail until the second ping is due.
			await vi.advanceTimersByTimeAsync(10000);
			await expect(
				vi.advanceTimersByTimeAsync(10000)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Tail disconnected, exiting.]`
			);
			await api.closeHelper();
		});

		it("errors when the websocket stops reacting to pings (json format)", async () => {
			api = mockWebsocketAPIs();
			vi.useFakeTimers({
				toFake: ["setInterval"],
			});
			// Block the websocket from replying to the ping
			vi.spyOn(MockWebSocket.prototype, "ping").mockImplementation(() => {});
			await runWrangler("tail test-worker --format=json");
			await api.ws.connected;
			// The ping is sent every 2 secs, so it should not fail until the second ping is due.
			await expect(
				vi.advanceTimersByTimeAsync(10000)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Tail disconnected, exiting.]`
			);
			await api.closeHelper();
		});
	});

	it("should error helpfully if pages_build_output_dir is set in wrangler.toml", async () => {
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
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
		websocketURL,
		env,
		useServiceEnvironments,
		expectedScriptName
	);
	api.requests.deletion = mockDeleteTailRequest(
		env,
		useServiceEnvironments,
		expectedScriptName
	);
	api.ws = new MockWebSocketServer(websocketURL);
	mockWebSockets.push(api.ws);

	return api;
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
