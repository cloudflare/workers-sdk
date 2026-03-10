import { setTimeout } from "node:timers/promises";
import { http, HttpResponse } from "msw";
import { Headers, Request } from "undici";
import { afterEach, describe, it, vi } from "vitest";
import MockWebSocketServer from "vitest-websocket-mock";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { MockWebSocket } from "../helpers/mock-web-socket";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import type {
	AlarmEvent,
	EmailEvent,
	QueueEvent,
	RequestEvent,
	ScheduledEvent,
	TailEventMessage,
	TailEventMessageType,
} from "../../tail/createTail";
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

describe("pages deployment tail", () => {
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	let api: MockAPI;
	afterEach(async () => {
		await api?.closeHelper?.();

		mockWebSockets.forEach((ws) => ws.close());
		mockWebSockets = [];
	});

	mockAccountId();
	mockApiToken();
	const std = mockConsoleMethods();

	/**
	 * Interaction with the tailing API, including tail creation,
	 * deletion, and connection.
	 */
	describe("API interaction", () => {
		it("should throw an error if deployment isn't provided", async ({
			expect,
		}) => {
			api = mockTailAPIs();
			await expect(
				runWrangler("pages deployment tail")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Must specify a deployment in non-interactive mode.]`
			);
			expect(api.requests.deployments.count).toStrictEqual(0);
			await api.closeHelper();
		});

		it("creates and then delete tails by deployment ID", async ({ expect }) => {
			api = mockTailAPIs();
			expect(api.requests.creation.length).toStrictEqual(0);

			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project"
			);

			await expect(api.ws.connected).resolves.toBeTruthy();
			expect(api.requests.creation.length).toStrictEqual(1);
			expect(api.requests.deletion.count).toStrictEqual(0);

			await api.closeHelper();
			expect(api.requests.deletion.count).toStrictEqual(1);
			await api.closeHelper();
		});

		it("only uses deployments with status=success and name=deploy", async ({
			expect,
		}) => {
			setIsTTY(true);

			api = mockTailAPIs("mock-deployment-id");
			expect(api.requests.creation.length).toStrictEqual(0);

			await runWrangler("pages deployment tail --project-name mock-project");

			await expect(api.ws.connected).resolves.toBeTruthy();
			expect(api.requests.creation.length).toStrictEqual(1);
			expect(api.requests.deletion.count).toStrictEqual(0);

			await api.closeHelper();
			expect(api.requests.deletion.count).toStrictEqual(1);
			await api.closeHelper();
		});

		it("creates and then deletes tails by deployment URL", async ({
			expect,
		}) => {
			api = mockTailAPIs();
			expect(api.requests.creation.length).toStrictEqual(0);

			await runWrangler(
				"pages deployment tail https://87bbc8fe.mock.pages.dev --project-name mock-project"
			);

			await expect(api.ws.connected).resolves.toBeTruthy();
			expect(api.requests.creation.length).toStrictEqual(1);
			expect(api.requests.deletion.count).toStrictEqual(0);

			await api.closeHelper();
			expect(api.requests.deletion.count).toStrictEqual(1);
			await api.closeHelper();
		});

		it("errors when passing in a deployment without a project", async ({
			expect,
		}) => {
			await expect(
				runWrangler("pages deployment tail foo")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Must specify a project name in non-interactive mode.]`
			);
		});

		it("creates and then delete tails by project name", async ({ expect }) => {
			api = mockTailAPIs();
			expect(api.requests.creation.length).toStrictEqual(0);

			await runWrangler(
				"pages deployment tail mock-deployment --project-name mock-project"
			);

			await expect(api.ws.connected).resolves.toBeTruthy();
			expect(api.requests.creation.length).toStrictEqual(1);
			expect(api.requests.deletion.count).toStrictEqual(0);

			await api.closeHelper();
			expect(api.requests.deletion.count).toStrictEqual(1);
		});

		it("errors when the websocket closes unexpectedly", async ({ expect }) => {
			api = mockTailAPIs();
			await api.closeHelper();

			await expect(
				runWrangler(
					"pages deployment tail mock-deployment-id --project-name mock-project"
				)
			).rejects.toThrow(
				"Connection to deployment mock-deployment-id closed unexpectedly."
			);
		});

		it("activates debug mode when the cli arg is passed in", async ({
			expect,
		}) => {
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --debug"
			);
			await expect(api.nextMessageJson()).resolves.toHaveProperty(
				"debug",
				true
			);
			await api.closeHelper();
		});

		it("passes default environment to deployments list", async ({ expect }) => {
			api = mockTailAPIs();
			expect(api.requests.creation.length).toStrictEqual(0);

			await runWrangler(
				"pages deployment tail --project-name mock-project mock-deployment-id"
			);

			await expect(api.ws.connected).resolves.toBeTruthy();
			console.log(api.requests.deployments.queryParams[0]);
			expect(api.requests.deployments.count).toStrictEqual(1);
			expect(
				api.requests.deployments.queryParams[0].find(([key, _]) => {
					return key === "env";
				})
			).toStrictEqual(["env", "production"]);
			await api.closeHelper();
		});

		it("passes production environment to deployments list", async ({
			expect,
		}) => {
			api = mockTailAPIs();
			expect(api.requests.creation.length).toStrictEqual(0);

			await runWrangler(
				"pages deployment tail --project-name mock-project mock-deployment-id --environment production"
			);

			await expect(api.ws.connected).resolves.toBeTruthy();
			console.log(api.requests.deployments.queryParams[0]);
			expect(api.requests.deployments.count).toStrictEqual(1);
			expect(
				api.requests.deployments.queryParams[0].find(([key, _]) => {
					return key === "env";
				})
			).toStrictEqual(["env", "production"]);
			await api.closeHelper();
		});

		it("passes preview environment to deployments list", async ({ expect }) => {
			api = mockTailAPIs();
			expect(api.requests.creation.length).toStrictEqual(0);

			await runWrangler(
				"pages deployment tail --project-name mock-project mock-deployment-id --environment preview"
			);

			await expect(api.ws.connected).resolves.toBeTruthy();
			console.log(api.requests.deployments.queryParams[0]);
			expect(api.requests.deployments.count).toStrictEqual(1);
			expect(
				api.requests.deployments.queryParams[0].find(([key, _]) => {
					return key === "env";
				})
			).toStrictEqual(["env", "preview"]);
			await api.closeHelper();
		});
	});

	describe("filtering", () => {
		it("should throw for bad sampling rate filters ranges", async ({
			expect,
		}) => {
			const tooHigh = runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --sampling-rate 10"
			);

			await expect(tooHigh).rejects.toThrow();

			const tooLow = runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --sampling-rate -5"
			);
			await expect(tooLow).rejects.toThrow();
		});

		it("should send sampling rate filter", async ({ expect }) => {
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --sampling-rate 0.25"
			);
			expect(api.requests.creation[0]).toEqual({
				filters: [{ sampling_rate: 0.25 }],
			});
			await api.closeHelper();
		});

		it("sends single status filters", async ({ expect }) => {
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --status error"
			);
			expect(api.requests.creation[0]).toEqual({
				filters: [
					{
						outcome: ["exception", "exceededCpu", "exceededMemory", "unknown"],
					},
				],
			});
			await api.closeHelper();
		});

		it("sends multiple status filters", async ({ expect }) => {
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --status error --status canceled"
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
		});

		it("sends single HTTP method filters", async ({ expect }) => {
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --method POST"
			);
			expect(api.requests.creation[0]).toEqual({
				filters: [{ method: ["POST"] }],
			});
			await api.closeHelper();
		});

		it("sends multiple HTTP method filters", async ({ expect }) => {
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --method POST --method GET"
			);
			expect(api.requests.creation[0]).toEqual({
				filters: [{ method: ["POST", "GET"] }],
			});
			await api.closeHelper();
		});

		it("sends header filters without a query", async ({ expect }) => {
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --header X-CUSTOM-HEADER"
			);
			expect(api.requests.creation[0]).toEqual({
				filters: [{ header: { key: "X-CUSTOM-HEADER" } }],
			});
			await api.closeHelper();
		});

		it("sends header filters with a query", async ({ expect }) => {
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --header X-CUSTOM-HEADER:some-value"
			);
			expect(api.requests.creation[0]).toEqual({
				filters: [{ header: { key: "X-CUSTOM-HEADER", query: "some-value" } }],
			});
			await api.closeHelper();
		});

		it("sends single IP filters", async ({ expect }) => {
			api = mockTailAPIs();
			const fakeIp = "192.0.2.1";

			await runWrangler(
				`pages deployment tail mock-deployment-id --project-name mock-project --ip ${fakeIp}`
			);
			expect(api.requests.creation[0]).toEqual({
				filters: [{ client_ip: [`${fakeIp}`] }],
			});
			await api.closeHelper();
		});

		it("sends multiple IP filters", async ({ expect }) => {
			api = mockTailAPIs();
			const fakeIp = "192.0.2.1";

			await runWrangler(
				`pages deployment tail mock-deployment-id --project-name mock-project --ip ${fakeIp} --ip self`
			);
			expect(api.requests.creation[0]).toEqual({
				filters: [{ client_ip: [`${fakeIp}`, "self"] }],
			});
			await api.closeHelper();
		});

		it("sends search filters", async ({ expect }) => {
			api = mockTailAPIs();
			const search = "filterMe";

			await runWrangler(
				`pages deployment tail mock-deployment-id --project-name mock-project --search ${search}`
			);
			expect(api.requests.creation[0]).toEqual({
				filters: [{ query: `${search}` }],
			});
			await api.closeHelper();
		});

		it("sends everything but the kitchen sink", async ({ expect }) => {
			api = mockTailAPIs();
			const sampling_rate = 0.69;
			const status = ["ok", "error"];
			const method = ["GET", "POST", "PUT"];
			const header = "X-HELLO:world";
			const client_ip = ["192.0.2.1", "self"];
			const query = "onlyTheseMessagesPlease";

			const cliFilters =
				`--sampling-rate ${sampling_rate} ` +
				status.map((s) => `--status ${s} `).join("") +
				method.map((m) => `--method ${m} `).join("") +
				`--header ${header} ` +
				client_ip.map((c) => `--ip ${c} `).join("") +
				`--search ${query} ` +
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
				],
			};

			await runWrangler(
				`pages deployment tail mock-deployment-id --project-name mock-project ${cliFilters}`
			);
			expect(api.requests.creation[0]).toEqual(expectedWebsocketMessage);
			await api.closeHelper();
		});
	});

	describe("printing", () => {
		it("logs request messages in JSON format", async ({ expect }) => {
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --format json"
			);

			const event = generateMockRequestEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
		});

		it("logs scheduled messages in JSON format", async ({ expect }) => {
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --format json"
			);

			const event = generateMockScheduledEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
		});

		it("logs alarm messages in json format", async ({ expect }) => {
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --format json"
			);

			const event = generateMockAlarmEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
		});

		it("logs email messages in json format", async ({ expect }) => {
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --format json"
			);

			const event = generateMockEmailEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
		});

		it("logs queue messages in json format", async ({ expect }) => {
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --format json"
			);

			const event = generateMockQueueEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
		});

		it("logs request messages in pretty format", async ({ expect }) => {
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --format pretty"
			);

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
					.replace(
						mockTailExpiration.toLocaleString(),
						"[mock expiration date]"
					)
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Connected to deployment mock-deployment-id, waiting for logs...
				GET https://example.org/ - Ok @ [mock event timestamp]"
			`);
			await api.closeHelper();
		});

		it("logs scheduled messages in pretty format", async ({ expect }) => {
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --format pretty"
			);

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
					.replace(
						mockTailExpiration.toLocaleString(),
						"[mock expiration date]"
					)
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Connected to deployment mock-deployment-id, waiting for logs...
				"* * * * *" @ [mock timestamp string] - Ok"
			`);
			await api.closeHelper();
		});

		it("logs alarm messages in pretty format", async ({ expect }) => {
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --format pretty"
			);

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
					.replace(
						mockTailExpiration.toLocaleString(),
						"[mock expiration date]"
					)
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Connected to deployment mock-deployment-id, waiting for logs...
				Alarm @ [mock scheduled time] - Ok"
			`);
			await api.closeHelper();
		});

		it("logs email messages in pretty format", async ({ expect }) => {
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --format pretty"
			);

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
					.replace(
						mockTailExpiration.toLocaleString(),
						"[mock expiration date]"
					)
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Connected to deployment mock-deployment-id, waiting for logs...
				Email from:from@example.com to:to@example.com size:45416 @ [mock event timestamp] - Ok"
			`);
			await api.closeHelper();
		});

		it("logs queue messages in pretty format", async ({ expect }) => {
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --format pretty"
			);

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
					.replace(
						mockTailExpiration.toLocaleString(),
						"[mock expiration date]"
					)
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Connected to deployment mock-deployment-id, waiting for logs...
				Queue my-queue123 (7 messages) - Ok @ [mock timestamp string]"
			`);
			await api.closeHelper();
		});

		it("should not crash when the tail message has a void event", async ({
			expect,
		}) => {
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project --format pretty"
			);

			const message = generateMockEventMessage({ event: null });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(
				std.out
					.replace(
						mockTailExpiration.toLocaleString(),
						"[mock expiration date]"
					)
					.replace(
						new Date(mockEventTimestamp).toLocaleString(),
						"[mock timestamp string]"
					)
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Connected to deployment mock-deployment-id, waiting for logs...
				Unknown Event - Ok @ [mock timestamp string]"
			`);
			await api.closeHelper();
		});

		it("defaults to logging in pretty format when the output is a TTY", async ({
			expect,
		}) => {
			setIsTTY(true);
			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project"
			);

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
					.replace(
						mockTailExpiration.toLocaleString(),
						"[mock expiration date]"
					)
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Connected to deployment mock-deployment-id, waiting for logs...
				GET https://example.org/ - Ok @ [mock event timestamp]"
			`);
			await api.closeHelper();
		});

		it("defaults to logging in json format when the output is not a TTY", async ({
			expect,
		}) => {
			setIsTTY(false);

			api = mockTailAPIs();
			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project"
			);

			const event = generateMockRequestEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(JSON.parse(std.out)).toEqual(
				deserializeJsonMessage(serializedMessage)
			);
			await api.closeHelper();
		});

		it("logs console messages and exceptions", async ({ expect }) => {
			setIsTTY(true);
			api = mockTailAPIs();

			await runWrangler(
				"pages deployment tail mock-deployment-id --project-name mock-project"
			);

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
				std.out.replace(
					new Date(mockEventTimestamp).toLocaleString(),
					"[mock event timestamp]"
				)
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Connected to deployment mock-deployment-id, waiting for logs...
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
		deployments: RequestLogger;
		creation: RequestInit[];
		deletion: RequestCounter;
	};
	ws: MockWebSocketServer;
	nextMessageJson(): Promise<unknown>;
	closeHelper: () => Promise<void>;
};

/**
 * A logger used to check how many times a mock API has been hit.
 * Useful as a helper in our testing to check if wrangler is making
 * the correct API calls without actually sending any web traffic.
 */
type RequestLogger = {
	count: number;
	queryParams: [string, string][][];
};

/**
 * Mock out the API hit during Tail creation
 *
 * @returns a `RequestCounter` for counting how many times the API is hit
 */
function mockListDeployments(): RequestLogger {
	const requests: RequestLogger = { count: 0, queryParams: [] };
	msw.use(
		http.get(
			`*/accounts/:accountId/pages/projects/:projectName/deployments`,
			({ request }) => {
				const url = new URL(request.url);
				requests.queryParams.push(Array.from(url.searchParams.entries()));
				requests.count++;
				return HttpResponse.json(
					{
						success: true,
						errors: [],
						messages: [],
						result: [
							{
								id: "mock-deployment-id-skipped",
								url: "https://abc123.mock.pages.dev",
								environment: "production",
								created_on: "2020-01-17T14:52:26.133835Z",
								latest_stage: {
									ended_on: "2020-01-17T14:52:26.133835Z",
									status: "skipped",
									name: "deploy",
								},
								deployment_trigger: {
									metadata: {
										branch: "main",
										commit_hash: "11122334c4cb32ad4f65b530b9424e8be5bec9d6",
									},
								},
								project_name: "mock-project",
							},
							{
								id: "mock-deployment-id",
								url: "https://87bbc8fe.mock.pages.dev",
								environment: "production",
								created_on: "2021-11-17T14:52:26.133835Z",
								latest_stage: {
									ended_on: "2021-11-17T14:52:26.133835Z",
									status: "success",
									name: "deploy",
								},
								deployment_trigger: {
									metadata: {
										branch: "main",
										commit_hash: "c7649364c4cb32ad4f65b530b9424e8be5bec9d6",
									},
								},
								project_name: "mock-project",
							},
						],
					},
					{ status: 200 }
				);
			},
			{ once: true }
		)
	);

	return requests;
}

/**
 * Mock out the API hit during Tail creation
 *
 * @returns a `RequestCounter` for counting how many times the API is hit
 */
function mockCreateTailRequest(
	deploymentId: string = ":deploymentId"
): RequestInit[] {
	const requests: RequestInit[] = [];
	msw.use(
		http.post(
			`*/accounts/:accountId/pages/projects/:projectName/deployments/${deploymentId}/tails`,
			async ({ request }) => {
				requests.push((await request.json()) as RequestInit);
				return HttpResponse.json(
					{
						success: true,
						errors: [],
						messages: [],
						result: {
							id: "tail-id",
							url: websocketURL,
							expires_at: mockTailExpiration,
						},
					},
					{ status: 200 }
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
 * A counter used to check how many times a mock API has been hit.
 * Useful as a helper in our testing to check if wrangler is making
 * the correct API calls without actually sending any web traffic
 */
type RequestCounter = {
	count: number;
};

/**
 * Mock out the API hit during Tail deletion
 *
 * @returns a `RequestCounter` for counting how many times the API is hit
 */
function mockDeleteTailRequest(): RequestCounter {
	const requests = { count: 0 };
	msw.use(
		http.delete(
			`*/accounts/:accountId/pages/projects/:projectName/deployments/:deploymentId/tails/:tailId`,
			() => {
				requests.count++;
				return HttpResponse.json(
					{ success: true, errors: [], messages: [], result: null },
					{ status: 200 }
				);
			},
			{ once: true }
		)
	);

	return requests;
}

let mockWebSockets: MockWebSocketServer[] = [];

const websocketURL = "ws://localhost:1234";
/**
 * All-in-one convenience method to mock the appropriate API calls before
 * each test, and clean up afterwards.
 *
 * @param websocketURL a fake websocket URL for wrangler to connect to
 * @returns a mocked-out version of the API
 */
function mockTailAPIs(
	expectedCreateDeploymentId: string = ":deploymentId"
): MockAPI {
	const api: MockAPI = {
		requests: {
			deletion: { count: 0 },
			creation: [],
			deployments: { count: 0, queryParams: [] },
		},
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		ws: null!, // will be set in the `beforeEach()`.

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

	api.ws = new MockWebSocketServer(websocketURL);
	mockWebSockets.push(api.ws);

	api.requests.creation = mockCreateTailRequest(expectedCreateDeploymentId);
	api.requests.deletion = mockDeleteTailRequest();
	api.requests.deployments = mockListDeployments();

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
	exceptions = [],
	logs = [],
	eventTimestamp = mockEventTimestamp,
	event = generateMockRequestEvent(),
}: Partial<TailEventMessage>): TailEventMessage {
	return {
		outcome,
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
function generateMockQueueEvent(opts?: Partial<QueueEvent>): QueueEvent {
	return {
		queue: opts?.queue || "my-queue123",
		batchSize: opts?.batchSize || 7,
	};
}
