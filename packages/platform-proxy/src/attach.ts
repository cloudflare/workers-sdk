import { setTimeout } from "node:timers/promises";
import { ExecutionContext } from "./execution-context";
import type { CacheStorage } from "./caches";
import type { PlatformProxy } from "./platform-proxy";
import type { NodeBindingDescriptor, WebSocket } from "miniflare";

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
 * that forwards requests with `Miniflare#dispatchFetch()`, and returns its
 * primary Worker's bindings, `caches` and `cf`. Behind the Vite plugin, that's
 * the user's Worker.
 *
 * When the runtime restarts, e.g. after a config change, the proxy connects
 * again through `url`. `env`, `cf` and `caches` then reach the new runtime, so
 * they can be kept. Anything taken from them before the restart, such as a
 * binding or a Durable Object stub, can't be used anymore.
 *
 * @param url URL of the runtime, or of a dev server in front of it.
 * @param secret The runtime's secret, if this process doesn't share it.
 * @returns The Worker's platform. Dispose it when done.
 */
export async function attachPlatformProxy<
	Env = Record<string, unknown>,
	CfProperties extends Record<string, unknown> = Record<string, unknown>,
>(
	url: string | URL,
	secret?: string
): Promise<PlatformProxy<Env, CfProperties>> {
	const { CoreHeaders, CorePaths, fetch, PROXY_SECRET, ProxyClient, ProxyOps } =
		await import("miniflare");
	const runtimeSecret = secret ?? PROXY_SECRET;

	async function handshake() {
		// An ordinary async request, so it also works through a dev server running
		// in this process
		const response = await fetch(new URL(CorePaths.PLATFORM_PROXY, url), {
			method: "POST",
			headers: {
				[CoreHeaders.OP_SECRET]: runtimeSecret,
				[CoreHeaders.OP]: ProxyOps.CONNECT_PLATFORM_PROXY,
			},
		}).catch((cause: unknown) => {
			throw new Error(
				`Couldn't connect to the runtime at ${url}. Is the dev server listening?`,
				{ cause }
			);
		});
		if (response.status === 401) {
			throw new Error(
				`The runtime at ${url} rejected the connection (status 401). In the same process, @cloudflare/platform-proxy and the Cloudflare Vite plugin must use the same version of Miniflare. From another process, start both with the same MINIFLARE_PLATFORM_PROXY_SECRET, or pass it as \`secret\`.`
			);
		}
		if (!response.ok) {
			throw new Error(
				`Couldn't connect to the runtime at ${url} (status ${response.status}).`
			);
		}
		const info = (await response.json()) as {
			bindings: Record<string, NodeBindingDescriptor>;
			runtimeUrl: string;
			cf: Record<string, unknown>;
		};
		return { ...info, runtimeUrl: new URL(info.runtimeUrl) };
	}

	let watcher: WebSocket | undefined;
	let disposed = false;
	async function watch(runtimeUrl: URL) {
		const response = await fetch(
			new URL(CorePaths.PLATFORM_PROXY, runtimeUrl),
			{
				headers: {
					Upgrade: "websocket",
					[CoreHeaders.OP_SECRET]: runtimeSecret,
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
				const { runtimeUrl, bindings, cf } = await handshake();
				await watch(runtimeUrl);
				client.setRuntimeEntryURL(runtimeUrl);
				current = { env: client.getBindings<Env>(bindings), cf };
				return;
			} catch {
				// The dev server or runtime may still be restarting
				await setTimeout(500);
			}
		}
	}

	const { runtimeUrl, bindings, cf } = await handshake();
	// Reading a binding blocks this thread until the reply arrives, so talk to
	// the runtime directly. Through a dev server in this process, it'd deadlock.
	// Other Workers' code may run in this process (e.g. in Vite's module
	// runner), so reading their properties mustn't wait on them
	const client = new ProxyClient(
		runtimeUrl,
		fetch,
		runtimeSecret,
		/* lazyRpcProperties */ true
	);
	await client.warm();
	await watch(runtimeUrl);
	let current = { env: client.getBindings<Env>(bindings), cf };
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
