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
	/** HTTP entry address for WebSocket upgrade fallback (e.g. "http://127.0.0.1:8787"). */
	entryAddress: string;
	hasAssets: boolean;
}

/** Minimal env shape required by the shared functions. */
export interface ProxyEnv {
	DEV_REGISTRY: Fetcher;
	DEV_REGISTRY_DEBUG_PORT: WorkerdDebugPortConnector;
}

// --- Functions ---

/**
 * Resolve a worker name to its registry entry by fetching from the
 * DiskDirectory service that exposes the dev registry directory.
 * Returns null if the worker is not registered (404).
 */
export async function resolveTarget(
	env: ProxyEnv,
	service: string
): Promise<RegistryEntry | null> {
	const resp = await env.DEV_REGISTRY.fetch(`http://dummy/${service}`);
	if (!resp.ok) {
		return null;
	}
	return resp.json();
}

/**
 * Compute the workerd service name for a given worker.
 *
 * Workers with static assets have their default entrypoint routed through
 * the assets:rpc-proxy service for correct asset routing. Named entrypoints
 * always go directly to the core:user service.
 */
export function getWorkerdServiceName(
	service: string,
	entrypoint: string | null,
	hasAssets: boolean
): string {
	if (hasAssets && (entrypoint === null || entrypoint === "default")) {
		return `assets:rpc-proxy:${service}`;
	}
	return `core:user:${service}`;
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
	return client.getActor(
		getWorkerdServiceName(scriptName, null, target.hasAssets),
		className,
		actorId
	);
}

/** Handler event methods that should NOT be forwarded as RPC. */
export const HANDLER_RESERVED_KEYS = new Set([
	"alarm",
	"fetch",
	"scheduled",
	"self",
	"tail",
	"tailStream",
	"test",
	"trace",
	"webSocketClose",
	"webSocketError",
	"webSocketMessage",
]);

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
					if (typeof prop === "string" && HANDLER_RESERVED_KEYS.has(prop)) {
						return undefined;
					}
					if (typeof prop === "string") {
						const methodName = prop;
						return async function (...args: unknown[]) {
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
					}
					return undefined;
				},
			});
		}

		async fetch(request: Request): Promise<Response> {
			// WebSocket upgrades don't work through the debug port RPC.
			// For DOs, we'd need to route via HTTP with the actor ID, which is complex.
			// For now, return an error for WebSocket upgrades to DOs.
			const isWebSocketUpgrade =
				request.headers.get("Upgrade")?.toLowerCase() === "websocket";
			if (isWebSocketUpgrade) {
				// TODO: Implement HTTP fallback for DO WebSocket upgrades
				// This would require knowing the DO HTTP routing path
				return new Response(
					`WebSocket upgrades to remote Durable Objects are not yet supported in local dev. ` +
						`Durable Object "${className}" of service "${scriptName}" cannot accept WebSocket connections through the dev registry proxy.`,
					{ status: 501 }
				);
			}

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
				const response = await fetcher.fetch(request);

				// Handle WebSocket responses (shouldn't happen due to check above,
				// but included for completeness)
				if (response.webSocket) {
					return new Response(null, {
						status: 101,
						webSocket: response.webSocket,
					});
				}

				const body = await response.arrayBuffer();
				return new Response(body, {
					status: response.status,
					statusText: response.statusText,
					headers: response.headers,
				});
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tailEventsReplacer(_: string, value: any) {
	if (value instanceof Date) {
		return { [SERIALIZED_DATE]: value.toISOString() };
	}
	return value;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tailEventsReviver(_: string, value: any) {
	if (value && typeof value === "object" && SERIALIZED_DATE in value) {
		return new Date(value[SERIALIZED_DATE]);
	}
	return value;
}
