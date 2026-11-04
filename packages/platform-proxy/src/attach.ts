import { setTimeout } from "node:timers/promises";
import {
	CoreHeaders,
	CorePaths,
	fetch,
	PROXY_SECRET,
	ProxyClient,
	ProxyOps,
} from "miniflare";
import { ExecutionContext } from "./execution-context";
import type { CacheStorage } from "./caches";
import type { PlatformProxy } from "./platform-proxy";
import type { WebSocket, WorkerNodeBindings } from "miniflare";

/** Options for attaching to a runtime that's already running */
export type AttachPlatformProxyOptions = {
	/** URL of the runtime, or of a dev server in front of it, such as Vite's */
	url: string | URL;
	/** The Worker to use. Defaults to the runtime's primary Worker. */
	worker?: string;
	/** The runtime's `MINIFLARE_PLATFORM_PROXY_SECRET`, if this process doesn't share it */
	secret?: string;
};

/**
 * Returns an object that forwards to whatever `getTarget()` currently returns,
 * so callers can keep it across runtime restarts.
 *
 * @param getTarget Returns the object to forward to.
 * @returns An object that forwards to the current target.
 */
function forwardTo<T extends object>(getTarget: () => T): T {
	return new Proxy({} as T, {
		get: (_, key) => Reflect.get(getTarget(), key),
		set: (_, key, value) => Reflect.set(getTarget(), key, value),
		has: (_, key) => Reflect.has(getTarget(), key),
		ownKeys: () => Reflect.ownKeys(getTarget()),
		getOwnPropertyDescriptor: (_, key) =>
			Reflect.getOwnPropertyDescriptor(getTarget(), key),
	});
}

/**
 * Attaches to a running Miniflare runtime, directly or through a dev server
 * that forwards requests with `Miniflare#dispatchFetch()`, and returns one
 * Worker's bindings, `caches` and `cf`.
 *
 * When the runtime restarts, e.g. after a config change, the proxy connects
 * again through `url`. `env`, `cf` and `caches` then reach the new runtime, so
 * they can be kept. Anything taken from them before the restart, such as a
 * binding or a Durable Object stub, can't be used anymore.
 *
 * @param options The runtime's URL, the Worker to attach to, and the runtime's
 * secret.
 * @returns The Worker's platform. Dispose it when done.
 */
export async function attachPlatformProxy<
	Env = Record<string, unknown>,
	CfProperties extends Record<string, unknown> = Record<string, unknown>,
>(
	options: AttachPlatformProxyOptions
): Promise<PlatformProxy<Env, CfProperties>> {
	const { url } = options;
	const secret = options.secret ?? PROXY_SECRET;

	async function handshake() {
		// An ordinary async request, so it also works through a dev server running
		// in this process
		const response = await fetch(new URL(CorePaths.PLATFORM_PROXY, url), {
			method: "POST",
			headers: {
				[CoreHeaders.OP_SECRET]: secret,
				[CoreHeaders.OP]: ProxyOps.CONNECT_PLATFORM_PROXY,
			},
		});
		if (!response.ok) {
			throw new Error(
				`Couldn't connect to the runtime at ${url} (status ${response.status}).`
			);
		}
		const info = (await response.json()) as {
			workers: WorkerNodeBindings[];
			runtimeUrl: string;
			cf: Record<string, unknown>;
		};
		// The runtime lists its primary Worker first
		const worker =
			options.worker === undefined
				? info.workers[0]
				: info.workers.find(({ name }) => name === options.worker);
		if (worker === undefined) {
			throw new TypeError(
				`No Worker named ${JSON.stringify(options.worker)} in the runtime at ${url}.`
			);
		}
		return { runtimeUrl: new URL(info.runtimeUrl), worker, cf: info.cf };
	}

	let watcher: WebSocket | undefined;
	let disposed = false;
	async function watch(runtimeUrl: URL) {
		const response = await fetch(
			new URL(CorePaths.PLATFORM_PROXY, runtimeUrl),
			{
				headers: {
					Upgrade: "websocket",
					[CoreHeaders.OP_SECRET]: secret,
					[CoreHeaders.OP]: ProxyOps.WATCH_PLATFORM_PROXY,
				},
			}
		);
		const webSocket = response.webSocket;
		if (webSocket === null) {
			throw new Error(
				`Couldn't watch the runtime at ${runtimeUrl} (status ${response.status}).`
			);
		}
		webSocket.accept();
		webSocket.addEventListener("close", () => {
			if (disposed) {
				return;
			}
			// The runtime's heap is gone, even if it comes back on the same port
			client.poisonProxies();
			void reconnect();
		});
		watcher = webSocket;
	}
	async function reconnect() {
		while (!disposed) {
			try {
				const { runtimeUrl, worker, cf } = await handshake();
				await watch(runtimeUrl);
				client.setRuntimeEntryURL(runtimeUrl);
				current = { env: client.getBindings<Env>(worker.bindings), cf };
				return;
			} catch {
				// The dev server or runtime may still be restarting
				await setTimeout(500);
			}
		}
	}

	const { runtimeUrl, worker, cf } = await handshake();
	// Reading a binding blocks this thread until the reply arrives, so talk to
	// the runtime directly. Through a dev server in this process, it'd deadlock.
	const client = new ProxyClient(runtimeUrl, fetch, secret);
	await client.warm();
	await watch(runtimeUrl);
	let current = { env: client.getBindings<Env>(worker.bindings), cf };
	return {
		env: forwardTo(() => current.env as Env & object),
		cf: forwardTo(() => current.cf) as CfProperties,
		ctx: new ExecutionContext(),
		// The runtime's own `caches`, typed like the stand-in
		caches: forwardTo(() => client.global.caches as unknown as CacheStorage),
		dispose: () => {
			disposed = true;
			watcher?.close();
			return client.dispose();
		},
	};
}
