import { beforeEach, describe, it, vi } from "vitest";
import { seedRemoteHyperdriveBindings } from "./seed-hyperdrive-bindings";
import type { RemoteProxyConnectionString } from "miniflare";

type FakeSocket = {
	emitUpgrade(connectionString: string): void;
	emitError(message: string): void;
};

// Hoisted so `vi.mock`'s factory — which is lifted above the imports — can
// reach the constructor it has to return.
const { sockets, FakeWebSocket } = vi.hoisted(() => {
	type Listener = (arg: unknown) => void;
	const opened: FakeSocket[] = [];

	/**
	 * Minimal stand-in for the `ws` client: records its listeners so a test can
	 * drive either an `upgrade` (carrying the edge's connection string) or an
	 * `error` for each attempt.
	 */
	class FakeWsClient implements FakeSocket {
		#listeners = new Map<string, Listener>();

		constructor() {
			opened.push(this);
		}

		on(event: string, listener: Listener): this {
			this.#listeners.set(event, listener);
			return this;
		}

		close(): void {}

		emitUpgrade(connectionString: string): void {
			this.#listeners.get("upgrade")?.({
				headers: { "mf-hd-connection-string": connectionString },
			});
		}

		emitError(message: string): void {
			this.#listeners.get("error")?.(new Error(message));
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

/**
 * Waits for seeding's next attempt to open its socket, then answers it.
 *
 * Real timers: the retry backoff runs on `node:timers/promises`, which
 * Vitest's fake timers do not patch, and the few hundred milliseconds it
 * costs are cheaper than the indirection needed to fake it.
 */
async function driveAttempts(
	attempts: number,
	respond: (socket: FakeSocket, attempt: number) => void
): Promise<void> {
	for (let attempt = 1; attempt <= attempts; attempt++) {
		const socket = await waitForSocket(attempt);
		respond(socket, attempt);
	}
}

async function waitForSocket(attempt: number): Promise<FakeSocket> {
	for (let poll = 0; poll < 200; poll++) {
		const socket = sockets[attempt - 1];
		if (socket) {
			return socket;
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(`attempt ${attempt} never opened a socket`);
}

describe("seedRemoteHyperdriveBindings", () => {
	beforeEach(() => {
		sockets.length = 0;
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

	it("retries a failed attempt and keeps the credentials it eventually gets", async ({
		expect,
	}) => {
		// `getPlatformProxy()` never re-enters this path, so without a retry a
		// transient failure here leaves its Hyperdrive bindings unauthenticated
		// for the life of the host process.
		const seeded = seedRemoteHyperdriveBindings(
			hyperdriveBindings(),
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
		expect(sockets).toHaveLength(2);
	});

	it("gives up after repeated failures so the caller can degrade", async ({
		expect,
	}) => {
		const seeded = seedRemoteHyperdriveBindings(
			hyperdriveBindings(),
			remoteProxyConnectionString
		).catch((error: unknown) => error);

		await driveAttempts(3, (socket) => socket.emitError("connection reset"));

		const result = await seeded;
		expect(result).toBeInstanceOf(Error);
		expect((result as Error).message).toContain("connection reset");
		expect(sockets).toHaveLength(3);
	});
});
