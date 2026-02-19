import { WorkerEntrypoint } from "cloudflare:workers";
import {
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
): Promise<Fetcher> {
	const { entrypoint } = props;
	// Named entrypoints route directly to the user worker service, bypassing
	// any assets/vite proxy layer. The default entrypoint uses the registry's
	// configured service name, which accounts for those proxies.
	const serviceName =
		entrypoint === null || entrypoint === "default"
			? target.defaultEntrypointService
			: target.userWorkerService;
	const client = await env.DEV_REGISTRY_DEBUG_PORT.connect(
		target.debugPortAddress
	);
	return client.getEntrypoint(serviceName, entrypoint ?? undefined);
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
							const fetcher = await connectToEntrypoint(
								target.env,
								target._props,
								registryEntry
							);
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

		try {
			const fetcher = await connectToEntrypoint(this.env, this._props, target);
			return fetcher.fetch(request);
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
			const fetcher = await connectToEntrypoint(this.env, this._props, target);
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
		} catch {
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
