/**
 * Shared utilities for the dev-registry proxy workers.
 *
 * These functions are used by both:
 * - dev-registry-proxy.worker.ts (the ExternalServiceProxy entrypoint worker)
 * - the outbound DO proxy service (createOutboundDoProxyService in external-service.ts)
 *
 * This file is bundled as a standalone worker module and included alongside
 * the inline JS in the outbound DO proxy service's modules array.
 */
import { DurableObject } from "cloudflare:workers";

// --- Types ---

export interface WorkerdDebugPortConnector {
	connect(address: string): Promise<WorkerdDebugPortClient>;
}

export interface WorkerdDebugPortClient {
	getEntrypoint(
		service: string,
		entrypoint?: string,
		props?: Record<string, unknown>
	): Promise<Fetcher>;
	getActor(
		service: string,
		entrypoint: string,
		actorId: string
	): Promise<Fetcher>;
}

export interface RegistryEntry {
	debugPortAddress: string;
	/** Service name for the default entrypoint (may route through assets/vite proxy). */
	defaultEntrypointService: string;
	/** Service name for the user worker directly (for named entrypoints and DOs). */
	userWorkerService: string;
}

/** Minimal env shape required by the shared functions. */
export interface ProxyEnv {
	DEV_REGISTRY: Fetcher;
	DEV_REGISTRY_DEBUG_PORT: WorkerdDebugPortConnector;
}

// --- Functions ---

const registryCache = new Map<string, RegistryEntry>();
let cacheTimeout: ReturnType<typeof setTimeout> | undefined;

function setCacheTimeout() {
	if (cacheTimeout === undefined) {
		// Clear cache every 30s to pick up revived workers.
		cacheTimeout = setTimeout(() => {
			registryCache.clear();
			cacheTimeout = undefined;
		}, 30_000);
	}
}

/**
 * Resolve a worker name to its registry entry by fetching from the
 * DiskDirectory service that exposes the dev registry directory.
 * Returns null if the worker is not registered (404) or if the
 * registry file is unreadable (e.g. mid-write, corrupted, stale format).
 */
export async function resolveTarget(
	env: ProxyEnv,
	service: string
): Promise<RegistryEntry | null> {
	const cached = registryCache.get(service);
	if (cached) return cached;

	const resp = await env.DEV_REGISTRY.fetch(`http://dummy/${service}`);
	if (resp.status === 404) {
		return null;
	}
	if (!resp.ok) {
		console.warn(
			`[dev-registry] Unexpected status ${resp.status} resolving service "${service}"`
		);
		return null;
	}

	let entry: RegistryEntry;
	try {
		entry = await resp.json();
	} catch {
		// File may be mid-write or corrupted — treat as not yet available.
		console.warn(
			`[dev-registry] Failed to parse registry entry for service "${service}"`
		);
		return null;
	}

	// Validate shape and required fields — the JSON comes from disk and may
	// be stale, corrupted, or from an older version that doesn't include all fields.
	if (
		!entry ||
		typeof entry !== "object" ||
		!entry.debugPortAddress ||
		!entry.defaultEntrypointService ||
		!entry.userWorkerService
	) {
		return null;
	}

	registryCache.set(service, entry);
	setCacheTimeout();

	return entry;
}

/**
 * Connect to a Durable Object actor on a remote workerd instance via the debug port.
 * Returns the Fetcher for the actor, or null if the target worker is not registered.
 */
export async function connectToActor(
	env: ProxyEnv,
	scriptName: string,
	className: string,
	actorId: string
): Promise<Fetcher | null> {
	const target = await resolveTarget(env, scriptName);
	if (!target) {
		return null;
	}
	const client = await env.DEV_REGISTRY_DEBUG_PORT.connect(
		target.debugPortAddress
	);
	// DOs are defined on the user worker, not behind the assets/vite proxy.
	return client.getActor(target.userWorkerService, className, actorId);
}

/**
 * Create a DurableObject proxy class that forwards fetch and RPC calls
 * to a remote Durable Object via the workerd debug port.
 */
export function createProxyDurableObjectClass({
	scriptName,
	className,
}: {
	scriptName: string;
	className: string;
}): typeof DurableObject {
	return class extends DurableObject {
		constructor(ctx: DurableObjectState, env: ProxyEnv) {
			super(ctx, env);
			return new Proxy(this, {
				get(obj, prop) {
					if (Reflect.has(obj, prop)) {
						return Reflect.get(obj, prop);
					}
					if (typeof prop === "string") {
						const methodName = prop;
						const rpcCall = async function (...args: unknown[]) {
							const fetcher = await connectToActor(
								obj.env as ProxyEnv,
								scriptName,
								className,
								obj.ctx.id.toString()
							);
							if (!fetcher) {
								throw new Error(
									`Couldn't find a local dev session for Durable Object "${className}" of service "${scriptName}" to proxy to`
								);
							}
							const method = (
								fetcher as unknown as Record<
									string,
									(...a: unknown[]) => unknown
								>
							)[methodName];
							return Reflect.apply(method, fetcher, args);
						};

						// Make the function thenable so `await stub.property`
						// resolves via the remote, matching JsRpcProperty behavior.
						rpcCall.then = (
							resolve: (v: unknown) => void,
							reject: (e: unknown) => void
						) => {
							connectToActor(
								obj.env as ProxyEnv,
								scriptName,
								className,
								obj.ctx.id.toString()
							)
								.then((fetcher) => {
									if (!fetcher) {
										throw new Error(
											`Couldn't find a local dev session for Durable Object "${className}" of service "${scriptName}" to proxy to`
										);
									}
									return (fetcher as unknown as Record<string, unknown>)[
										methodName
									];
								})
								.then(resolve, reject);
						};
						return rpcCall;
					}
					return undefined;
				},
			});
		}

		async fetch(request: Request): Promise<Response> {
			const fetcher = await connectToActor(
				this.env as ProxyEnv,
				scriptName,
				className,
				this.ctx.id.toString()
			);
			if (!fetcher) {
				return new Response(
					`Couldn't find a local dev session for Durable Object "${className}" of service "${scriptName}" to proxy to`,
					{ status: 503 }
				);
			}
			try {
				return await fetcher.fetch(request);
			} catch (e) {
				return new Response(
					`Error connecting to Durable Object "${className}" of "${scriptName}": ${e instanceof Error ? e.message : String(e)}`,
					{ status: 502 }
				);
			}
		}
	} as unknown as typeof DurableObject;
}

// --- Tail event serialization helpers ---
// Tail events contain Date objects that aren't directly serializable over capnp,
// so we JSON round-trip them with custom replacer/reviver.

const SERIALIZED_DATE = "___serialized_date___";

export function tailEventsReplacer(_: string, value: any) {
	if (value instanceof Date) {
		return { [SERIALIZED_DATE]: value.toISOString() };
	}
	return value;
}

export function tailEventsReviver(_: string, value: any) {
	if (value && typeof value === "object" && SERIALIZED_DATE in value) {
		return new Date(value[SERIALIZED_DATE]);
	}
	return value;
}
