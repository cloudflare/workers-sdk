import { Buffer } from "node:buffer";
import { analyseBundle } from "@cloudflare/deploy-helpers/startup-profile";
import { FormData } from "undici";
import { beforeEach, describe, it, vi } from "vitest";

interface InspectorCommand {
	id: number;
	method: string;
}

interface MockSocket {
	commands: InspectorCommand[];
	terminated: boolean;
	respond(id: number, result?: unknown): void;
}

interface MockRuntime {
	dispatchCount: number;
	disposeCount: number;
	options: {
		modules?: { path: string }[];
	};
}

const lifecycle = vi.hoisted(() => ({
	dispatchError: undefined as Error | undefined,
	dispatchResponse: undefined as Response | undefined,
	openError: undefined as Error | undefined,
	miniflares: [] as MockRuntime[],
	sockets: [] as MockSocket[],
}));

vi.mock("miniflare", () => ({
	convertV4MiniflareOptions: (options: unknown) => options,
	Miniflare: class {
		readonly ready = Promise.resolve();
		dispatchCount = 0;
		disposeCount = 0;

		constructor(
			readonly options: {
				modules?: { path: string }[];
			}
		) {
			lifecycle.miniflares.push(this);
		}

		async getInspectorURL(): Promise<URL> {
			return new URL("http://127.0.0.1:8787");
		}

		async dispatchFetch(): Promise<Response> {
			this.dispatchCount++;
			if (lifecycle.dispatchError !== undefined) {
				throw lifecycle.dispatchError;
			}
			return lifecycle.dispatchResponse ?? new Response("ok");
		}

		async dispose(): Promise<void> {
			this.disposeCount++;
		}
	},
}));

vi.mock("ws", async () => {
	const { EventEmitter } = await import("node:events");

	class MockWebSocket extends EventEmitter implements MockSocket {
		static readonly CLOSED = 3;

		readonly commands: InspectorCommand[] = [];
		readyState = 0;
		terminated = false;

		constructor(_url: URL) {
			super();
			lifecycle.sockets.push(this);
			queueMicrotask(() => {
				if (lifecycle.openError !== undefined) {
					this.emit("error", lifecycle.openError);
					return;
				}
				this.readyState = 1;
				this.emit("open");
			});
		}

		send(data: string, callback?: (error?: Error | null) => void): void {
			this.commands.push(JSON.parse(data) as InspectorCommand);
			callback?.(null);
		}

		respond(id: number, result?: unknown): void {
			this.emit(
				"message",
				Buffer.from(
					JSON.stringify(result === undefined ? { id } : { id, result }),
					"utf8"
				)
			);
		}

		terminate(): void {
			this.terminated = true;
			this.readyState = MockWebSocket.CLOSED;
		}
	}

	return { WebSocket: MockWebSocket };
});

describe("startup profile lifecycle", () => {
	beforeEach(() => {
		lifecycle.dispatchError = undefined;
		lifecycle.dispatchResponse = undefined;
		lifecycle.openError = undefined;
		lifecycle.miniflares.length = 0;
		lifecycle.sockets.length = 0;
	});

	it("waits for each inspector acknowledgement before advancing", async ({
		expect,
	}) => {
		const profile = { nodes: [], startTime: 1, endTime: 2 };
		const result = analyseBundle(createWorkerBundle());
		const socket = await waitForCommandCount(1);
		const miniflare = lifecycle.miniflares[0];

		expect(socket.commands.map(({ method }) => method)).toEqual([
			"Profiler.enable",
		]);
		expect(miniflare.dispatchCount).toBe(0);

		socket.respond(1);
		await waitForCommandCount(2);
		expect(socket.commands.map(({ method }) => method)).toEqual([
			"Profiler.enable",
			"Profiler.start",
		]);
		expect(miniflare.dispatchCount).toBe(0);

		socket.respond(2);
		await waitForCommandCount(3);
		expect(socket.commands.map(({ method }) => method)).toEqual([
			"Profiler.enable",
			"Profiler.start",
			"Profiler.stop",
		]);
		expect(miniflare.dispatchCount).toBe(1);

		socket.respond(3, { profile });
		await expect(result).resolves.toEqual(profile);
		expect(socket.terminated).toBe(true);
		expect(miniflare.disposeCount).toBe(1);
	});

	it("keeps multipart binding parts available as importable modules", async ({
		expect,
	}) => {
		const profile = { nodes: [], startTime: 1, endTime: 2 };
		const result = analyseBundle(createWorkerBundleWithMultipartBindings());
		const socket = await waitForCommandCount(1);
		const miniflare = lifecycle.miniflares[0];
		const modulePaths = miniflare.options.modules?.map(({ path }) => path);

		expect(modulePaths).toContain("index.js");
		// A multipart part may be both an env binding and an imported module.
		expect(modulePaths).toContain("startup.txt");
		expect(modulePaths).toContain("startup.bin");

		socket.respond(1);
		await waitForCommandCount(2);
		socket.respond(2);
		await waitForCommandCount(3);
		socket.respond(3, { profile });

		await expect(result).resolves.toEqual(profile);
	});

	it("disposes the runtime and inspector after a dispatch failure", async ({
		expect,
	}) => {
		lifecycle.dispatchError = new Error("deterministic dispatch failure");
		const result = analyseBundle(createWorkerBundle());
		const socket = await waitForCommandCount(1);
		const miniflare = lifecycle.miniflares[0];

		socket.respond(1);
		await waitForCommandCount(2);
		socket.respond(2);

		await expect(result).rejects.toThrow("deterministic dispatch failure");
		expect(socket.terminated).toBe(true);
		expect(miniflare.disposeCount).toBe(1);
	});

	it("drains a failed module evaluation response and stops the profiler", async ({
		expect,
	}) => {
		const profile = { nodes: [], startTime: 1, endTime: 2 };
		const dispatchResponse = new Response(
			"SECRET_VALUE\n/Users/example/private-worker/index.js",
			{ status: 500 }
		);
		lifecycle.dispatchResponse = dispatchResponse;
		const result = analyseBundle(createWorkerBundle());
		const socket = await waitForCommandCount(1);
		const miniflare = lifecycle.miniflares[0];

		socket.respond(1);
		await waitForCommandCount(2);
		socket.respond(2);
		await waitForCommandCount(3);
		socket.respond(3, { profile });

		await expect(result).resolves.toEqual(profile);
		expect(dispatchResponse.bodyUsed).toBe(true);
		expect(socket.commands.map(({ method }) => method)).toEqual([
			"Profiler.enable",
			"Profiler.start",
			"Profiler.stop",
		]);
		expect(socket.terminated).toBe(true);
		expect(miniflare.disposeCount).toBe(1);
	});

	it("disposes the runtime and inspector after a connection failure", async ({
		expect,
	}) => {
		lifecycle.openError = new Error("deterministic connection failure");
		const result = analyseBundle(createWorkerBundle());

		await expect(result).rejects.toThrow("deterministic connection failure");
		expect(lifecycle.sockets[0].terminated).toBe(true);
		expect(lifecycle.miniflares[0].disposeCount).toBe(1);
	});
});

function createWorkerBundle(): FormData {
	const workerBundle = new FormData();
	workerBundle.set(
		"metadata",
		JSON.stringify({
			main_module: "index.js",
			compatibility_date: "2025-01-01",
		})
	);
	workerBundle.set(
		"index.js",
		new File(
			["export default { fetch() { return new Response('ok'); } };"],
			"index.js",
			{ type: "application/javascript+module" }
		)
	);
	return workerBundle;
}

function createWorkerBundleWithMultipartBindings(): FormData {
	const workerBundle = createWorkerBundle();
	workerBundle.set(
		"metadata",
		JSON.stringify({
			main_module: "index.js",
			compatibility_date: "2025-01-01",
			bindings: [
				{
					name: "STARTUP_TEXT_BLOB",
					type: "text_blob",
					part: "startup.txt",
				},
				{
					name: "STARTUP_DATA_BLOB",
					type: "data_blob",
					part: "startup.bin",
				},
			],
		})
	);
	workerBundle.set(
		"startup.txt",
		new File(["startup text"], "startup.txt", { type: "text/plain" })
	);
	workerBundle.set(
		"startup.bin",
		new File([new Uint8Array([1, 2, 3])], "startup.bin", {
			type: "application/octet-stream",
		})
	);
	return workerBundle;
}

async function waitForCommandCount(commandCount: number): Promise<MockSocket> {
	let socket: MockSocket | undefined;
	await vi.waitFor(() => {
		socket = lifecycle.sockets[0];
		if (socket?.commands.length !== commandCount) {
			throw new Error(`Expected ${commandCount} inspector commands`);
		}
	});
	return socket as MockSocket;
}
