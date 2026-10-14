import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { seedRemoteHyperdriveBindings } from "./seed-hyperdrive-bindings";
import type { RemoteProxyConnectionString } from "miniflare";

type FakeSocket = {
	emitUpgrade(connectionString: unknown): void;
	emitError(message: string): void;
	emitClose(): void;
	terminated: boolean;
	listenerCount(event: string): number;
};

const { sockets, FakeWebSocket } = vi.hoisted(() => {
	type Listener = (arg?: unknown) => void;
	const opened: FakeSocket[] = [];
	class FakeWsClient implements FakeSocket {
		#listeners = new Map<string, Listener>();
		terminated = false;
		constructor() {
			opened.push(this);
		}
		on(event: string, listener: Listener): this {
			this.#listeners.set(event, listener);
			return this;
		}
		removeAllListeners(event: string): this {
			this.#listeners.delete(event);
			return this;
		}
		listenerCount(event: string): number {
			return this.#listeners.has(event) ? 1 : 0;
		}
		terminate(): void {
			this.terminated = true;
			this.emitError("late handshake error");
		}
		emitUpgrade(connectionString: unknown): void {
			this.#listeners.get("upgrade")?.({
				headers: { "mf-hd-connection-string": connectionString },
			});
		}
		emitError(message: string): void {
			this.#listeners.get("error")?.(new Error(message));
		}
		emitClose(): void {
			this.#listeners.get("close")?.();
		}
	}
	return { sockets: opened, FakeWebSocket: FakeWsClient };
});
vi.mock("ws", () => ({ default: FakeWebSocket }));

const remoteProxyConnectionString = new URL(
	"http://localhost:8787"
) as RemoteProxyConnectionString;
const SEEDED = "mysql://edge-user:edge-pass@hyperdrive.local:3306/db";

function hyperdriveBindings() {
	return {
		HYPERDRIVE: { type: "hyperdrive" as const, id: "some-id", remote: true },
	};
}

async function driveAttempts(
	attempts: number,
	respond: (socket: FakeSocket, attempt: number) => void
): Promise<void> {
	for (let attempt = 1; attempt <= attempts; attempt++) {
		respond(await waitForSocket(attempt), attempt);
	}
}

async function waitForSocket(attempt: number): Promise<FakeSocket> {
	for (let poll = 0; poll < 200; poll++) {
		const socket = sockets[attempt - 1];
		if (socket) {
			return socket;
		}
		await delay(10);
	}
	throw new Error(`attempt ${attempt} never opened a socket`);
}

describe("seedRemoteHyperdriveBindings", () => {
	beforeEach(() => {
		sockets.length = 0;
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns an empty map when there is no session or no remote binding", async ({
		expect,
	}) => {
		expect(
			await seedRemoteHyperdriveBindings(hyperdriveBindings(), undefined)
		).toEqual(new Map());
		expect(
			await seedRemoteHyperdriveBindings(
				{ SERVICE: { type: "service", service: "worker", remote: true } },
				remoteProxyConnectionString
			)
		).toEqual(new Map());
		expect(sockets).toHaveLength(0);
	});

	it("retries a failed attempt and cleans every socket", async ({ expect }) => {
		const bindings = hyperdriveBindings();
		const seeded = seedRemoteHyperdriveBindings(
			bindings,
			remoteProxyConnectionString
		);
		await driveAttempts(2, (socket, attempt) => {
			if (attempt === 1) {
				socket.emitError("connection reset");
			} else {
				socket.emitUpgrade(SEEDED);
			}
		});
		expect(await seeded).toEqual(new Map([["HYPERDRIVE", SEEDED]]));
		expect(bindings).toEqual(hyperdriveBindings());
		expect(sockets).toHaveLength(2);
		for (const socket of sockets) {
			expect(socket.terminated).toBe(true);
			expect(socket.listenerCount("upgrade")).toBe(0);
			expect(socket.listenerCount("close")).toBe(0);
		}
	});

	it.for([
		["PostgreSQL", "postgresql://user:password@edge:5432/database"],
		["Postgres", "postgres://user:password@edge:5432/database"],
		["MySQL", SEEDED],
	])("accepts %s credentials", async ([, connectionString], { expect }) => {
		const seeded = seedRemoteHyperdriveBindings(
			hyperdriveBindings(),
			remoteProxyConnectionString
		);
		(await waitForSocket(1)).emitUpgrade(connectionString);
		expect((await seeded).get("HYPERDRIVE")).toBe(connectionString);
	});

	it.for([
		"missing",
		"malformed",
		"unsupported",
		"incomplete",
		"array",
		"error",
		"close",
	])(
		"rejects %s responses after three attempts without leaking secrets",
		async (kind, { expect }) => {
			const secret = "private-test-secret";
			const seeded = seedRemoteHyperdriveBindings(
				hyperdriveBindings(),
				remoteProxyConnectionString
			).catch((error: unknown) => error);
			await driveAttempts(3, (socket) => {
				switch (kind) {
					case "missing":
						socket.emitUpgrade(undefined);
						break;
					case "malformed":
						socket.emitUpgrade(secret);
						break;
					case "unsupported":
						socket.emitUpgrade(`https://user:${secret}@edge/db`);
						break;
					case "incomplete":
						socket.emitUpgrade(`mysql://:${secret}@edge/db`);
						break;
					case "array":
						socket.emitUpgrade([SEEDED]);
						break;
					case "error":
						socket.emitError(secret);
						break;
					case "close":
						socket.emitClose();
						break;
				}
			});
			const result = await seeded;
			expect(result).toBeInstanceOf(Error);
			expect(String(result)).toContain("HYPERDRIVE");
			expect(String(result)).not.toContain(secret);
			expect(sockets).toHaveLength(3);
			expect(sockets.every((socket) => socket.terminated)).toBe(true);
		}
	);

	it("bounds timeouts and releases timers and listeners", async ({
		expect,
	}) => {
		vi.useFakeTimers();
		const seeded = seedRemoteHyperdriveBindings(
			hyperdriveBindings(),
			remoteProxyConnectionString
		).catch((error: unknown) => error);
		for (let attempt = 1; attempt <= 3; attempt++) {
			await waitForSocket(attempt);
			await vi.advanceTimersByTimeAsync(10_000);
		}
		expect(await seeded).toBeInstanceOf(Error);
		expect(sockets).toHaveLength(3);
		expect(sockets.every((socket) => socket.terminated)).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});
});
