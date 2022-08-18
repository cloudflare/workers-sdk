import MockWebSocket from "jest-websocket-mock";
import { Headers, Request } from "undici";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type {
	TailEventMessage,
	RequestEvent,
	ScheduledEvent,
	AlarmEvent,
} from "../tail";
import type WebSocket from "ws";

describe("tail", () => {
	runInTempDir();
	mockAccountId();
	mockApiToken();

	const std = mockConsoleMethods();

	afterEach(() => {
		mockWebSockets.forEach((ws) => ws.close());
		mockWebSockets.splice(0);
	});

	/**
	 * Interaction with the tailing API, including tail creation,
	 * deletion, and connection.
	 */
	describe("API interaction", () => {
		it("should throw an error if name isn't provided", async () => {
			await expect(
				runWrangler("tail")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"Required Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with \`wrangler tail <worker-name>\`"`
			);
		});

		it("creates and then delete tails", async () => {
			const api = mockWebsocketAPIs();

			await runWrangler("tail test-worker");

			await expect(api.ws.connected).resolves.toBeTruthy();

			expect(std.out).toMatchInlineSnapshot(`
			"Successfully created tail, expires at 3005-02-01T06:00:00.000Z
			Connected to test-worker, waiting for logs..."
		`);

			api.ws.close();
		});

		it("creates and then delete tails: legacy envs", async () => {
			const api = mockWebsocketAPIs();

			await runWrangler("tail test-worker --env some-env --legacy-env true");

			await expect(api.ws.connected).resolves.toBeTruthy();

			api.ws.close();
		});

		it("creates and then delete tails: service envs", async () => {
			const api = mockWebsocketAPIs();

			await runWrangler("tail test-worker --env some-env --legacy-env false");

			await expect(api.ws.connected).resolves.toBeTruthy();

			api.ws.close();
		});

		it("errors when the websocket closes unexpectedly", async () => {
			const api = mockWebsocketAPIs();
			api.ws.close();

			await expect(runWrangler("tail test-worker")).rejects.toThrow();
		});

		it("activates debug mode when the cli arg is passed in", async () => {
			const api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --debug");
			await expect(api.nextMessageJson()).resolves.toHaveProperty(
				"debug",
				true
			);
		});
	});

	describe("filtering", () => {
		it("sends sampling rate filters", async () => {
			const api = mockWebsocketAPIs();
			const tooHigh = runWrangler("tail test-worker --sampling-rate 10");
			await expect(tooHigh).rejects.toThrow();

			const tooLow = runWrangler("tail test-worker --sampling-rate -5");
			await expect(tooLow).rejects.toThrow();

			await runWrangler("tail test-worker --sampling-rate 0.25");
			await expect(api.nextMessageJson()).resolves.toHaveProperty("filters", [
				{ sampling_rate: 0.25 },
			]);
		});

		it("sends single status filters", async () => {
			const api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --status error");
			await expect(api.nextMessageJson()).resolves.toHaveProperty("filters", [
				{ outcome: ["exception", "exceededCpu", "exceededMemory", "unknown"] },
			]);
		});

		it("sends multiple status filters", async () => {
			const api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --status error --status canceled");
			await expect(api.nextMessageJson()).resolves.toHaveProperty("filters", [
				{
					outcome: [
						"exception",
						"exceededCpu",
						"exceededMemory",
						"unknown",
						"canceled",
					],
				},
			]);
		});

		it("sends single HTTP method filters", async () => {
			const api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --method POST");
			await expect(api.nextMessageJson()).resolves.toHaveProperty("filters", [
				{ method: ["POST"] },
			]);
		});

		it("sends multiple HTTP method filters", async () => {
			const api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --method POST --method GET");
			await expect(api.nextMessageJson()).resolves.toHaveProperty("filters", [
				{ method: ["POST", "GET"] },
			]);
		});

		it("sends header filters without a query", async () => {
			const api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --header X-CUSTOM-HEADER");
			await expect(api.nextMessageJson()).resolves.toHaveProperty("filters", [
				{ header: { key: "X-CUSTOM-HEADER" } },
			]);
		});

		it("sends header filters with a query", async () => {
			const api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --header X-CUSTOM-HEADER:some-value");
			await expect(api.nextMessageJson()).resolves.toHaveProperty("filters", [
				{ header: { key: "X-CUSTOM-HEADER", query: "some-value" } },
			]);
		});

		it("sends single IP filters", async () => {
			const api = mockWebsocketAPIs();
			const fakeIp = "192.0.2.1";

			await runWrangler(`tail test-worker --ip ${fakeIp}`);
			await expect(api.nextMessageJson()).resolves.toHaveProperty("filters", [
				{ client_ip: [fakeIp] },
			]);
		});

		it("sends multiple IP filters", async () => {
			const api = mockWebsocketAPIs();
			const fakeIp = "192.0.2.1";

			await runWrangler(`tail test-worker --ip ${fakeIp} --ip self`);
			await expect(api.nextMessageJson()).resolves.toHaveProperty("filters", [
				{ client_ip: [fakeIp, "self"] },
			]);
		});

		it("sends search filters", async () => {
			const api = mockWebsocketAPIs();
			const search = "filterMe";

			await runWrangler(`tail test-worker --search ${search}`);
			await expect(api.nextMessageJson()).resolves.toHaveProperty("filters", [
				{ query: search },
			]);
		});

		it("sends everything but the kitchen sink", async () => {
			const api = mockWebsocketAPIs();
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
					{ sampling_rate },
					{
						outcome: [
							"ok",
							"exception",
							"exceededCpu",
							"exceededMemory",
							"unknown",
						],
					},
					{ method },
					{ header: { key: "X-HELLO", query: "world" } },
					{ client_ip },
					{ query },
				],
				debug: true,
			};

			await runWrangler(`tail test-worker ${cliFilters}`);
			await expect(api.nextMessageJson()).resolves.toEqual(
				expectedWebsocketMessage
			);
		});
	});

	describe("printing", () => {
		const { setIsTTY } = useMockIsTTY();

		it("logs request messages in JSON format", async () => {
			const api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --format json");

			const event = generateMockRequestEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(std.out).toMatch(deserializeToJson(serializedMessage));
		});

		it("logs scheduled messages in JSON format", async () => {
			const api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --format json");

			const event = generateMockScheduledEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(std.out).toMatch(deserializeToJson(serializedMessage));
		});

		it("logs alarm messages in json format", async () => {
			const api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --format json");

			const event = generateMockAlarmEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(std.out).toMatch(deserializeToJson(serializedMessage));
		});

		it("logs request messages in pretty format", async () => {
			const api = mockWebsocketAPIs();
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
					.replace(
						mockTailExpiration.toLocaleString(),
						"[mock expiration date]"
					)
			).toMatchInlineSnapshot(`
			"Successfully created tail, expires at 3005-02-01T06:00:00.000Z
			Connected to test-worker, waiting for logs...
			GET https://example.org/ - Ok @ [mock event timestamp]"
		`);
		});

		it("logs scheduled messages in pretty format", async () => {
			const api = mockWebsocketAPIs();
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
					.replace(
						mockTailExpiration.toLocaleString(),
						"[mock expiration date]"
					)
			).toMatchInlineSnapshot(`
			"Successfully created tail, expires at 3005-02-01T06:00:00.000Z
			Connected to test-worker, waiting for logs...
			\\"* * * * *\\" @ [mock timestamp string] - Ok"
		`);
		});

		it("logs alarm messages in pretty format", async () => {
			const api = mockWebsocketAPIs();
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
					.replace(
						mockTailExpiration.toLocaleString(),
						"[mock expiration date]"
					)
			).toMatchInlineSnapshot(`
			"Successfully created tail, expires at 3005-02-01T06:00:00.000Z
			Connected to test-worker, waiting for logs...
			Alarm @ [mock scheduled time] - Ok"
		`);
		});

		it("should not crash when the tail message has a void event", async () => {
			const api = mockWebsocketAPIs();
			await runWrangler("tail test-worker --format pretty");

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
			"Successfully created tail, expires at 3005-02-01T06:00:00.000Z
			Connected to test-worker, waiting for logs...
			Unknown Event - Ok @ [mock timestamp string]"
		`);
		});

		it("defaults to logging in pretty format when the output is a TTY", async () => {
			setIsTTY(true);
			const api = mockWebsocketAPIs();
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
					.replace(
						mockTailExpiration.toLocaleString(),
						"[mock expiration date]"
					)
			).toMatchInlineSnapshot(`
			"Successfully created tail, expires at 3005-02-01T06:00:00.000Z
			Connected to test-worker, waiting for logs...
			GET https://example.org/ - Ok @ [mock event timestamp]"
		`);
		});

		it("defaults to logging in json format when the output is not a TTY", async () => {
			setIsTTY(false);

			const api = mockWebsocketAPIs();
			await runWrangler("tail test-worker");

			const event = generateMockRequestEvent();
			const message = generateMockEventMessage({ event });
			const serializedMessage = serialize(message);

			api.ws.send(serializedMessage);
			expect(std.out).toMatch(deserializeToJson(serializedMessage));
		});

		it("logs console messages and exceptions", async () => {
			setIsTTY(true);
			const api = mockWebsocketAPIs();
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
					.replace(
						mockTailExpiration.toLocaleString(),
						"[mock expiration date]"
					)
			).toMatchInlineSnapshot(`
			"Successfully created tail, expires at 3005-02-01T06:00:00.000Z
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
function isRequest(
	event: ScheduledEvent | RequestEvent | AlarmEvent | undefined | null
): event is RequestEvent {
	return Boolean(event && "request" in event);
}

/**
 * Similarly, we need to deserialize from a raw buffer instead
 * of just JSON.parsing a raw string. This deserializer also then
 * re-stringifies with some spacing, the same way wrangler tail does.
 *
 * @param message a buffer of data received from the websocket
 * @returns a string ready to be printed to the terminal or compared against
 */
function deserializeToJson(message: WebSocket.RawData): string {
	return JSON.stringify(JSON.parse(message.toString()), null, 2);
}

/**
 * A mock for all the different API resources wrangler accesses
 * when running `wrangler tail`
 */
type MockAPI = {
	ws: MockWebSocket;
	nextMessageJson(): Promise<unknown>;
};

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

const mockWebSockets: MockWebSocket[] = [];

/**
 * All-in-one convenience method to mock the appropriate API calls before
 * each test, and clean up afterwards.
 *
 * @param websocketURL a fake websocket URL for wrangler to connect to
 * @returns a mocked-out version of the API
 */
function mockWebsocketAPIs(): MockAPI {
	const websocketURL = "ws://localhost:1234";
	const api: MockAPI = {
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
	};

	api.ws = new MockWebSocket(websocketURL);
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
