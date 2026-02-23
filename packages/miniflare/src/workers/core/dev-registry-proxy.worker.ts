import { WorkerEntrypoint } from "cloudflare:workers";
import {
	resolveTarget,
	tailEventsReplacer,
	tailEventsReviver,
} from "./dev-registry-proxy-shared.worker";
import type { ProxyEnv } from "./dev-registry-proxy-shared.worker";

// The entry worker service name in each miniflare/workerd instance.
// This must match SERVICE_ENTRY from plugins/core/constants.ts.
const ENTRY_SERVICE_NAME = "core:entry";

// Binding names for the dev registry proxy worker.
// These must match the binding names used in #assembleConfig() in index.ts.
export const DevRegistryProxyBindings = {
	DEBUG_PORT: "DEV_REGISTRY_DEBUG_PORT",
	DEV_REGISTRY: "DEV_REGISTRY",
} as const;

type Env = ProxyEnv;

interface Props {
	service: string;
	entrypoint: string | null;
}

/**
 * Proxy entrypoint for external service bindings.
 *
 * Uses a Proxy in the constructor (same pattern as assets/rpc-proxy.worker.ts)
 * to intercept arbitrary RPC method calls and forward them through the debug port.
 */
export class ExternalServiceProxy extends WorkerEntrypoint<Env> {
	// Public (not #private) because private fields are incompatible with Proxy —
	// the Proxy get trap cannot access private fields on the target object.
	_props: Props;

	#remoteFetcherPromise: Promise<Fetcher> | undefined;
	#remoteFetcherPromiseTimestamp = 0;

	constructor(ctx: ExecutionContext, env: Env) {
		super(ctx, env);
		this._props = (ctx as unknown as { props: Props }).props;

		return new Proxy(this, {
			get(target, prop) {
				// If the property exists on ExternalServiceProxy, use it
				if (Reflect.has(target, prop)) {
					const value = Reflect.get(target, prop);
					if (typeof value === "function") {
						return value.bind(target);
					}
					return value;
				}

				// For arbitrary RPC properties/methods, connect to the debug port.
				// The returned value must be both callable (for RPC method calls
				// like `env.SERVICE.method()`) and thenable (for RPC property
				// access like `await env.SERVICE.property`). This mirrors workerd's
				// JsRpcProperty behavior.
				if (typeof prop === "string") {
					const methodName = prop;
					const rpcCall = async function (...args: unknown[]) {
						const fetcher = await target.#getRemoteFetcher();
						const method = (
							fetcher as unknown as Record<string, (...a: unknown[]) => unknown>
						)[methodName];
						if (typeof method !== "function") {
							throw new Error(
								`Method "${methodName}" not found on remote service "${target._props.service}"`
							);
						}
						// IMPORTANT: RPC method calls on the debug port fetcher MUST use
						// Reflect.apply() rather than method.apply(). See class doc comment.
						return Reflect.apply(method, fetcher, args);
					};

					// Make the function thenable so `await env.SERVICE.property`
					// resolves via the remote, matching JsRpcProperty behavior.
					rpcCall.then = (
						resolve: (v: unknown) => void,
						reject: (e: unknown) => void
					) => {
						target
							.#getRemoteFetcher()
							.then((fetcher) =>
								Promise.resolve(
									(fetcher as unknown as Record<string, unknown>)[methodName]
								)
							)
							.then(resolve, reject);
					};
					return rpcCall;
				}

				return undefined;
			},
		});
	}

	/**
	 * Gets a `Fetcher` for the remote service, caching it for a short period.
	 * This avoids repeatedly resolving and connecting on every RPC call.
	 */
	async #getRemoteFetcher(): Promise<Fetcher> {
		// Cache the fetcher promise for 1 second to improve performance of
		// rapid sequential calls.
		if (
			this.#remoteFetcherPromise !== undefined &&
			Date.now() - this.#remoteFetcherPromiseTimestamp < 1000
		) {
			return this.#remoteFetcherPromise;
		}

		const promise = (async () => {
			const { service, entrypoint } = this._props;
			const target = await resolveTarget(this.env, service);
			if (!target) {
				throw new Error(
					`Couldn't find a local dev session for the "${entrypoint ?? "default"}" entrypoint of service "${service}" to proxy to`
				);
			}

			// Named entrypoints route directly to the user worker service, bypassing
			// any assets/vite proxy layer. The default entrypoint uses the registry's
			// configured service name, which accounts for those proxies.
			const serviceName =
				entrypoint === null || entrypoint === "default"
					? target.defaultEntrypointService
					: target.userWorkerService;
			const client = await this.env.DEV_REGISTRY_DEBUG_PORT.connect(
				target.debugPortAddress
			);
			return client.getEntrypoint(serviceName, entrypoint ?? undefined);
		})();

		this.#remoteFetcherPromise = promise;
		this.#remoteFetcherPromiseTimestamp = Date.now();

		// If the connection fails, clear the cache so the next call retries.
		// Only clear if the cache still holds this promise (a newer call may
		// have already replaced it).
		promise.catch(() => {
			if (this.#remoteFetcherPromise === promise) {
				this.#remoteFetcherPromise = undefined;
				this.#remoteFetcherPromiseTimestamp = 0;
			}
		});

		return promise;
	}

	async fetch(request: Request): Promise<Response> {
		try {
			const fetcher = await this.#getRemoteFetcher();
			return await fetcher.fetch(request);
		} catch (e) {
			const { service, entrypoint } = this._props;
			const message = e instanceof Error ? e.message : String(e);
			// Re-throw connection errors as HTTP Responses for fetch()
			if (message.startsWith("Couldn't find")) {
				return new Response(message, { status: 503 });
			} else {
				return new Response(
					`Error connecting to service "${service}" for entrypoint "${entrypoint}": ${message}`,
					{ status: 502 }
				);
			}
		}
	}

	async scheduled(controller: ScheduledController) {
		// `scheduled()` needs a different forwarding mechanism than other RPCs
		// because `Fetcher.scheduled()` is not supported over debug port RPC.
		// Instead, we send an HTTP request to the entry service's scheduled handler.
		// NOTE: This targets `core:entry` which routes the scheduled event to the
		// main worker in the remote process. This assumes each workerd process
		// hosts a single user worker (the standard dev mode configuration).
		const { service, entrypoint } = this._props;
		const target = await resolveTarget(this.env, service);
		if (!target) {
			throw new Error(
				`Couldn't find a local dev session for the "${entrypoint ?? "default"}" entrypoint of service "${service}" to proxy to`
			);
		}

		try {
			const client = await this.env.DEV_REGISTRY_DEBUG_PORT.connect(
				target.debugPortAddress
			);
			const fetcher = await client.getEntrypoint(ENTRY_SERVICE_NAME);
			const params = new URLSearchParams();
			if (controller.cron) {
				params.set("cron", controller.cron);
			}
			if (controller.scheduledTime) {
				params.set("time", String(controller.scheduledTime));
			}
			const response = await fetcher.fetch(
				`http://localhost/cdn-cgi/handler/scheduled?${params}`
			);
			if (!response.ok) {
				const body = await response.text();
				throw new Error(
					`Scheduled handler returned HTTP ${response.status}: ${body}`
				);
			}
		} catch (e) {
			throw new Error(
				`Error calling "scheduled" on the "${entrypoint ?? "default"}" entrypoint of service "${service}": ${e instanceof Error ? e.message : String(e)}`
			);
		}
	}

	async tail(events: TraceItem[]) {
		try {
			const fetcher = await this.#getRemoteFetcher();
			// Tail events are not directly serializable over capnp yet.
			// JSON round-trip makes them transferable.
			const serializedEvents = JSON.parse(
				JSON.stringify(events, tailEventsReplacer),
				tailEventsReviver
			);
			const tailMethod = (
				fetcher as unknown as Record<string, (...a: unknown[]) => unknown>
			)["tail"];
			if (typeof tailMethod === "function") {
				await Reflect.apply(tailMethod, fetcher, [serializedEvents]);
			}
		} catch (e) {
			// Tail events are best-effort and should not break the producer worker.
			console.warn(
				`[dev-registry] Failed to forward tail events to "${this._props.service}": ${e instanceof Error ? e.message : String(e)}`
			);
		}
	}

	async queue(_batch: MessageBatch): Promise<void> {
		throw new Error(
			`Calling "queue" on a cross-process service binding is not yet supported`
		);
	}
}

/**
 * Default export — the proxy worker uses named entrypoints (ExternalServiceProxy)
 * for all service binding proxying.
 */
export default <ExportedHandler<Env>>{
	async fetch() {
		return new Response("dev-registry-proxy: use named entrypoints", {
			status: 404,
		});
	},
};
