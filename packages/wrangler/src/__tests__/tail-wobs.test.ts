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
			const websocket = new MockWebSocketServer(websocketUrl);
			mockWebSockets.push(websocket);

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

			const shutdownHandler = process
				.listeners("SIGINT")
				.find((listener) => !sigintListeners.has(listener));
			if (!shutdownHandler) {
				throw new Error("The WOBS tail did not install a SIGINT handler");
			}
			shutdownHandler("SIGINT");
			await tailPromise;

			expect(terminate).toHaveBeenCalledOnce();
			expect(clearInterval).toHaveBeenCalledWith(intervalHandle);
			expect(process.listenerCount("SIGINT")).toBe(sigintListeners.size);
			expect(process.listenerCount("SIGTERM")).toBe(sigtermListeners.size);
		});
	});

	describe("authorization", () => {
		it("accepts API tokens and OAuth tokens with the WOBS read scope", ({
			expect,
		}) => {
			expect(() =>
				assertWobsTailAuthScopes(undefined, "default")
			).not.toThrow();
			expect(() =>
				assertWobsTailAuthScopes(
					["account:read", "workers_observability:read"],
					"default"
				)
			).not.toThrow();
		});

		it("explains how to re-authenticate an OAuth token without the scope", ({
			expect,
		}) => {
			expect(() =>
				assertWobsTailAuthScopes(
					["account:read", "workers_tail:read"],
					"default"
				)
			).toThrowErrorMatchingInlineSnapshot(
				`[Error: Your current Wrangler OAuth token does not include the \`workers_observability:read\` scope required by the experimental Workers Observability tail. Run \`wrangler login\` to re-authenticate, then try again.]`
			);

			expect(() =>
				assertWobsTailAuthScopes(["workers_tail:read"], "staging")
			).toThrow("Run `wrangler auth create staging` to re-authenticate");
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
