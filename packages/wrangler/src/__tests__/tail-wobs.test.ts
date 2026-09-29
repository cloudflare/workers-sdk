import { UserError } from "@cloudflare/workers-utils";
import { afterEach, describe, it, vi } from "vitest";
import MockWebSocketServer from "vitest-websocket-mock";
import {
	assertWobsTailAuthScopes,
	printWobsMessage,
	runWobsTail,
	translateCLICommandToWobsFilters,
} from "../tail/wobs";
import { mockConsoleMethods } from "./helpers/mock-console";
import { MockWebSocket } from "./helpers/mock-web-socket";

class MockWobsWebSocket extends MockWebSocket {
	constructor(url: string) {
		super(url);
	}
}

vi.mock("ws", async (importOriginal) => {
	const realModule = await importOriginal<typeof import("ws")>();
	const module = {
		__esModule: true,
	};
	Object.defineProperties(module, {
		default: {
			get() {
				return MockWobsWebSocket;
			},
		},
		WebSocket: {
			get() {
				return MockWobsWebSocket;
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

describe("Workers Observability tail", () => {
	const std = mockConsoleMethods();
	const mockWebSockets: MockWebSocketServer[] = [];

	function createMockServer(url: string): MockWebSocketServer {
		const server = new MockWebSocketServer(url);
		mockWebSockets.push(server);
		return server;
	}

	/** Find the SIGINT handler the tail installed, so tests can stop it like Ctrl-C. */
	function getTailSigintHandler(
		existingListeners: Set<NodeJS.SignalsListener>
	): NodeJS.SignalsListener {
		const handler = process
			.listeners("SIGINT")
			.find((listener) => !existingListeners.has(listener));
		if (!handler) {
			throw new Error("The WOBS tail did not install a SIGINT handler");
		}
		return handler;
	}

	function flushPromises(): Promise<void> {
		return new Promise((resolve) => setImmediate(resolve));
	}

	/**
	 * Emit a transport failure on the tail's client socket the way `ws` does:
	 * error listeners receive an `Error`, whereas mock-socket's typings only
	 * model DOM `Event`s.
	 */
	function emitTransportError(
		server: MockWebSocketServer,
		message: string
	): void {
		const error = Object.assign(new Error(message), { type: "error" });
		for (const client of server.server.clients()) {
			client.dispatchEvent(error as unknown as Event);
		}
	}

	afterEach(() => {
		for (const socket of mockWebSockets) {
			socket.close();
		}
		mockWebSockets.length = 0;
	});

	describe("connection", () => {
		it("creates an SDK live tail and refreshes eligibility until the socket closes", async ({
			expect,
		}) => {
			const sigintListeners = new Set(process.listeners("SIGINT"));
			const sigtermListeners = new Set(process.listeners("SIGTERM"));
			const terminate = vi.spyOn(MockWobsWebSocket.prototype, "terminate");
			let heartbeatCallback: (() => void) | undefined;
			const intervalHandle = {} as NodeJS.Timeout;
			vi.spyOn(globalThis, "setInterval").mockImplementation((callback) => {
				heartbeatCallback = () => callback();
				return intervalHandle;
			});
			const clearInterval = vi.spyOn(globalThis, "clearInterval");

			const websocketUrl = "ws://localhost:1235";
			const websocket = createMockServer(websocketUrl);

			const liveTail = vi.fn().mockResolvedValue({ wsUrl: websocketUrl });
			const liveTailHeartbeat = vi.fn().mockResolvedValue(undefined);
			const telemetry = { liveTail, liveTailHeartbeat };

			const tailPromise = runWobsTail({
				accountId: "some-account-id",
				scriptName: "test-worker",
				filters: { method: ["GET"] },
				format: "json",
				debug: false,
				telemetry,
			});

			await websocket.connected;

			expect(liveTail).toHaveBeenCalledWith({
				account_id: "some-account-id",
				scriptId: "test-worker",
				filterCombination: "and",
				filters: [
					{
						kind: "group",
						filterCombination: "or",
						filters: [
							{
								key: "$metadata.trigger",
								operation: "starts_with",
								type: "string",
								value: "GET ",
							},
						],
					},
				],
			});
			expect(liveTailHeartbeat).toHaveBeenCalledTimes(1);
			expect(liveTailHeartbeat).toHaveBeenLastCalledWith({
				account_id: "some-account-id",
				scriptId: "test-worker",
			});

			if (!heartbeatCallback) {
				throw new Error("The WOBS tail did not schedule a heartbeat interval");
			}
			heartbeatCallback();
			await vi.waitFor(() => {
				expect(liveTailHeartbeat).toHaveBeenCalledTimes(2);
			});

			getTailSigintHandler(sigintListeners)("SIGINT");
			await tailPromise;

			expect(terminate).toHaveBeenCalledOnce();
			expect(clearInterval).toHaveBeenCalledWith(intervalHandle);
			expect(process.listenerCount("SIGINT")).toBe(sigintListeners.size);
			expect(process.listenerCount("SIGTERM")).toBe(sigtermListeners.size);
		});

		it("reconnects after a transport failure and keeps streaming", async ({
			expect,
		}) => {
			const sigintListeners = new Set(process.listeners("SIGINT"));
			const firstServer = createMockServer("ws://localhost:1236");
			const secondServer = createMockServer("ws://localhost:1237");
			const liveTail = vi
				.fn()
				.mockResolvedValueOnce({ wsUrl: "ws://localhost:1236" })
				.mockResolvedValueOnce({ wsUrl: "ws://localhost:1237" });
			const telemetry = {
				liveTail,
				liveTailHeartbeat: vi.fn().mockResolvedValue(undefined),
			};

			const tailPromise = runWobsTail({
				accountId: "some-account-id",
				scriptName: "test-worker",
				filters: {},
				format: "json",
				debug: false,
				telemetry,
				reconnectBackoffMs: [0],
			});

			await firstServer.connected;
			emitTransportError(firstServer, "read ECONNRESET");

			await secondServer.connected;
			expect(liveTail).toHaveBeenCalledTimes(2);
			expect(std.warn).toContain(
				"Workers Observability tail for test-worker failed: read ECONNRESET. Reconnecting (attempt 1 of 1) in 0s..."
			);

			getTailSigintHandler(sigintListeners)("SIGINT");
			await tailPromise;

			expect(process.listenerCount("SIGINT")).toBe(sigintListeners.size);
		});

		it("gives up with a user error once reconnect attempts are exhausted", async ({
			expect,
		}) => {
			const sigintListeners = new Set(process.listeners("SIGINT"));
			const server = createMockServer("ws://localhost:1238");
			const telemetry = {
				liveTail: vi
					.fn()
					.mockResolvedValueOnce({ wsUrl: "ws://localhost:1238" })
					.mockRejectedValue(new Error("Service unavailable")),
				liveTailHeartbeat: vi.fn().mockResolvedValue(undefined),
			};

			const tailPromise = runWobsTail({
				accountId: "some-account-id",
				scriptName: "test-worker",
				filters: {},
				format: "json",
				debug: false,
				telemetry,
				reconnectBackoffMs: [0, 0],
			});

			await server.connected;
			server.close({ code: 1006, reason: "abnormal", wasClean: false });

			const error = await tailPromise.catch((caught: unknown) => caught);
			expect(error).toBeInstanceOf(UserError);
			expect(error).toMatchObject({
				message:
					"Unable to reconnect to the Workers Observability tail for test-worker after 2 attempts. Workers Observability tail for test-worker failed: Service unavailable.",
				telemetryMessage: "tail wobs reconnect failed",
			});
			expect(telemetry.liveTail).toHaveBeenCalledTimes(3);
			expect(process.listenerCount("SIGINT")).toBe(sigintListeners.size);
		});

		it("reconnects when heartbeats keep failing on an open socket", async ({
			expect,
		}) => {
			const sigintListeners = new Set(process.listeners("SIGINT"));
			let heartbeatCallback: (() => void) | undefined;
			vi.spyOn(globalThis, "setInterval").mockImplementation((callback) => {
				heartbeatCallback = () => callback();
				return {} as NodeJS.Timeout;
			});

			const firstServer = createMockServer("ws://localhost:1239");
			const secondServer = createMockServer("ws://localhost:1240");
			const liveTail = vi
				.fn()
				.mockResolvedValueOnce({ wsUrl: "ws://localhost:1239" })
				.mockResolvedValueOnce({ wsUrl: "ws://localhost:1240" });
			const liveTailHeartbeat = vi
				.fn()
				.mockRejectedValue(new Error("Forbidden"));

			const tailPromise = runWobsTail({
				accountId: "some-account-id",
				scriptName: "test-worker",
				filters: {},
				format: "json",
				debug: false,
				telemetry: { liveTail, liveTailHeartbeat },
				reconnectBackoffMs: [0],
			});

			await firstServer.connected;
			for (let failures = 1; failures < 3; failures++) {
				await vi.waitFor(() => {
					expect(liveTailHeartbeat).toHaveBeenCalledTimes(failures);
				});
				await flushPromises();
				heartbeatCallback?.();
			}

			await secondServer.connected;
			expect(liveTail).toHaveBeenCalledTimes(2);
			expect(std.warn).toContain(
				"Workers Observability tail for test-worker could not renew its live-tail session after 3 attempts. Reconnecting (attempt 1 of 1) in 0s..."
			);

			getTailSigintHandler(sigintListeners)("SIGINT");
			await tailPromise;
		});
	});

	describe("authorization", () => {
		it("accepts API tokens and OAuth tokens with the WOBS read scope", ({
			expect,
		}) => {
			expect(() =>
				assertWobsTailAuthScopes({
					isOAuth: false,
					scopes: undefined,
					profile: "default",
				})
			).not.toThrow();
			expect(() =>
				assertWobsTailAuthScopes({
					isOAuth: true,
					scopes: ["account:read", "workers_observability:read"],
					profile: "default",
				})
			).not.toThrow();
		});

		it("explains how to re-authenticate an OAuth token without the scope", ({
			expect,
		}) => {
			expect(() =>
				assertWobsTailAuthScopes({
					isOAuth: true,
					scopes: ["account:read", "workers_tail:read"],
					profile: "default",
				})
			).toThrowErrorMatchingInlineSnapshot(
				`[Error: Your current Wrangler OAuth token does not include the \`workers_observability:read\` scope required by the experimental Workers Observability tail. Run \`wrangler login\` to re-authenticate, then try again.]`
			);

			expect(() =>
				assertWobsTailAuthScopes({
					isOAuth: true,
					scopes: ["workers_tail:read"],
					profile: "staging",
				})
			).toThrow("Run `wrangler auth create staging` to re-authenticate");
		});

		it("treats OAuth credentials saved without a scope list as missing the scope", ({
			expect,
		}) => {
			expect(() =>
				assertWobsTailAuthScopes({
					isOAuth: true,
					scopes: undefined,
					profile: "default",
				})
			).toThrow("Run `wrangler login` to re-authenticate");
		});
	});

	describe("filter translation", () => {
		it("translates supported classic tail filters", ({ expect }) => {
			expect(
				translateCLICommandToWobsFilters({
					status: ["ok", "error", "canceled"],
					method: ["get", "POST"],
					search: "needle",
					versionId: "version-id",
				})
			).toEqual([
				{
					key: "$workers.outcome",
					operation: "in",
					type: "string",
					value: "ok,exception,exceededCpu,exceededMemory,unknown,canceled",
				},
				{
					kind: "group",
					filterCombination: "or",
					filters: [
						{
							key: "$metadata.trigger",
							operation: "starts_with",
							type: "string",
							value: "GET ",
						},
						{
							key: "$metadata.trigger",
							operation: "starts_with",
							type: "string",
							value: "POST ",
						},
					],
				},
				{
					key: "$metadata.message",
					operation: "includes",
					type: "string",
					value: "needle",
				},
				{
					key: "$workers.scriptVersion.id",
					operation: "eq",
					type: "string",
					value: "version-id",
				},
			]);
		});
	});

	describe("output", () => {
		it("prints direct telemetry events as JSON", ({ expect }) => {
			const event = {
				timestamp: 1_645_454_470_467,
				dataset: "cloudflare-workers",
				$metadata: { message: "hello", level: "info" },
			};

			printWobsMessage(Buffer.from(JSON.stringify(event)), "json");

			expect(JSON.parse(std.out)).toEqual(event);
		});

		it("prints console events in a compact pretty format", ({ expect }) => {
			printWobsMessage(
				Buffer.from(
					JSON.stringify({
						timestamp: 1_645_454_470_467,
						$metadata: { message: "hello", level: "info" },
					})
				),
				"pretty"
			);

			expect(std.out).toContain("2022-02-21T14:41:10.467Z");
			expect(std.out).toContain("INFO");
			expect(std.out).toContain("hello");
		});

		it("prints invocation outcome and timing", ({ expect }) => {
			printWobsMessage(
				Buffer.from(
					JSON.stringify({
						timestamp: 1_645_454_470_467,
						$metadata: {
							trigger: "GET /example",
							type: "cf-worker-event",
						},
						$workers: {
							cpuTimeMs: 3,
							outcome: "ok",
							wallTimeMs: 10,
						},
					})
				),
				"pretty"
			);

			expect(std.out).toContain("GET /example - ok (3ms CPU, 10ms wall)");
		});

		it("warns instead of crashing on malformed events", ({ expect }) => {
			printWobsMessage(Buffer.from("not-json"), "pretty");

			expect(std.warn).toContain(
				"Received a malformed Workers Observability tail event: not-json"
			);
		});
	});
});
