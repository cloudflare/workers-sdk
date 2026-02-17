import { WorkerEntrypoint } from "cloudflare:workers";
import {
	getWorkerdServiceName,
	HANDLER_RESERVED_KEYS,
	resolveTarget,
	tailEventsReplacer,
	tailEventsReviver,
} from "./dev-registry-proxy-shared.worker";
import type {
	ProxyEnv,
	RegistryEntry,
} from "./dev-registry-proxy-shared.worker";

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

async function connectToEntrypoint(
	env: Env,
	props: Props,
	target: RegistryEntry
) {
	const workerdServiceName = getWorkerdServiceName(
		props.service,
		props.entrypoint,
		target.hasAssets
	);
	const client = await env.DEV_REGISTRY_DEBUG_PORT.connect(
		target.debugPortAddress
	);
	const fetcher = await client.getEntrypoint(
		workerdServiceName,
		props.entrypoint ?? undefined
	);
	// Return both client and fetcher — the caller must keep a reference to
	// the client for the duration of the RPC call, otherwise the debug port
	// connection may be garbage collected and pending promises will fail
	// with "Promise will never complete."
	return { client, fetcher };
}

/**
 * Fetch via HTTP to the worker's entry address.
 * Used for WebSocket upgrades since the debug port RPC doesn't support them.
 *
 * This is a standalone function rather than a method because the class returns
 * a Proxy from its constructor, and private/method calls don't work correctly
 * through Proxies.
 */
async function fetchViaHttp(
	request: Request,
	target: RegistryEntry,
	props: Props
): Promise<Response> {
	const { service, entrypoint } = props;
	try {
		// Rewrite the request URL to target the remote worker's entry address
		const targetUrl = new URL(request.url);
		const entryUrl = new URL(target.entryAddress);
		targetUrl.protocol = entryUrl.protocol;
		targetUrl.host = entryUrl.host;

		const proxyRequest = new Request(targetUrl.toString(), request);
		const response = await fetch(proxyRequest);

		// WebSocket upgrade responses carry a webSocket property and no body.
		if (response.webSocket) {
			return new Response(null, {
				status: 101,
				webSocket: response.webSocket,
			});
		}

		// For non-WebSocket responses, return as-is
		return response;
	} catch (e) {
		return new Response(
			`Error connecting to service "${service}" (${entrypoint ?? "default"}) via HTTP: ${e instanceof Error ? e.message : String(e)}`,
			{ status: 502 }
		);
	}
}

/**
 * Proxy entrypoint for external service bindings.
 *
 * Uses a Proxy in the constructor (same pattern as assets/rpc-proxy.worker.ts)
 * to intercept arbitrary RPC method calls and forward them through the debug port.
 *
 * IMPORTANT: RPC method calls on the debug port fetcher MUST use Reflect.apply()
 * rather than method.apply(). The RPC methods returned by getEntrypoint() are
 * JsRpcProperty objects (callable via SetCallAsFunctionHandler), not v8::Functions.
 * Calling method.apply() resolves "apply" through the JSG wildcard property handler,
 * creating a nested JsRpcProperty for "ping.apply" which tries to serialize the
 * fetcher as an argument — triggering the "WorkerdDebugPort bindings cannot be
 * transferred" error. Reflect.apply() invokes [[Call]] directly, bypassing property
 * lookup entirely.
 */
export class ExternalServiceProxy extends WorkerEntrypoint<Env> {
	// Public (not #private) because private fields are incompatible with Proxy —
	// the Proxy get trap cannot access private fields on the target object.
	_props: Props;

	constructor(ctx: ExecutionContext, env: Env) {
		super(ctx, env);
		this._props = (ctx as unknown as { props: Props }).props;

		return new Proxy(this, {
			get(target, prop) {
				// If the property exists on ExternalServiceProxy, use it
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}

				// Skip handler-reserved keys
				if (typeof prop === "string" && HANDLER_RESERVED_KEYS.has(prop)) {
					return undefined;
				}

				// For arbitrary RPC methods, connect to the debug port and
				// call the method directly using Reflect.apply().
				if (typeof prop === "string") {
					const methodName = prop;
					return async function (...args: unknown[]) {
						const registryEntry = await resolveTarget(
							target.env,
							target._props.service
						);
						if (!registryEntry) {
							throw new Error(
								`Cannot access "${methodName}" as we couldn't find a local dev session for the "${target._props.entrypoint ?? "default"}" entrypoint of service "${target._props.service}" to proxy to.`
							);
						}
						try {
							const { client: _client, fetcher } = await connectToEntrypoint(
								target.env,
								target._props,
								registryEntry
							);
							void _client; // prevent GC of the debug port connection
							const method = (
								fetcher as unknown as Record<
									string,
									(...a: unknown[]) => unknown
								>
							)[methodName];
							if (typeof method !== "function") {
								throw new Error(
									`Method "${methodName}" not found on remote service "${target._props.service}"`
								);
							}
							return Reflect.apply(method, fetcher, args);
						} catch (e) {
							throw new Error(
								`Error calling "${methodName}" on the "${target._props.entrypoint ?? "default"}" entrypoint of service "${target._props.service}": ${e instanceof Error ? e.message : String(e)}`
							);
						}
					};
				}

				return undefined;
			},
		});
	}

	async fetch(request: Request): Promise<Response> {
		const { service, entrypoint } = this._props;
		const target = await resolveTarget(this.env, service);
		if (!target) {
			return new Response(
				`Couldn't find a local dev session for the "${entrypoint ?? "default"}" entrypoint of service "${service}" to proxy to`,
				{ status: 503 }
			);
		}

		// WebSocket upgrades don't work through the debug port RPC because the
		// kj::HttpClient→HttpService adapter doesn't properly signal allowWebSocket.
		// Fall back to HTTP for WebSocket upgrade requests.
		const isWebSocketUpgrade =
			request.headers.get("Upgrade")?.toLowerCase() === "websocket";
		if (isWebSocketUpgrade && target.entryAddress) {
			return fetchViaHttp(request, target, this._props);
		}

		try {
			const { client: _client, fetcher } = await connectToEntrypoint(
				this.env,
				this._props,
				target
			);
			void _client; // prevent GC of the debug port connection
			const response = await fetcher.fetch(request);

			// WebSocket upgrade responses carry a webSocket property and no body.
			// Forward them directly without buffering.
			if (response.webSocket) {
				return new Response(null, {
					status: 101,
					webSocket: response.webSocket,
				});
			}

			// Read the body eagerly to prevent it from being dropped when
			// the debug port RPC connection goes out of scope.
			const body = await response.arrayBuffer();
			return new Response(body, {
				status: response.status,
				statusText: response.statusText,
				headers: response.headers,
			});
		} catch (e) {
			return new Response(
				`Error connecting to service "${service}": ${e instanceof Error ? e.message : String(e)}`,
				{ status: 502 }
			);
		}
	}

	async tail(events: TraceItem[]) {
		const { service } = this._props;
		const target = await resolveTarget(this.env, service);
		if (!target) {
			return;
		}

		try {
			const { client: _client, fetcher } = await connectToEntrypoint(
				this.env,
				this._props,
				target
			);
			void _client; // prevent GC of the debug port connection
			// Tail events are not directly serializable over capnp yet.
			// JSON round-trip makes them transferable (same workaround as
			// assets/rpc-proxy.worker.ts).
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
		} catch (_e) {
			// Silently ignore tail forwarding errors — tail events are
			// best-effort and should not break the producer worker.
		}
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
