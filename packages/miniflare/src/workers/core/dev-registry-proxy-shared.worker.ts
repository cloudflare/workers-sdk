/**
 * Shared utilities for the dev-registry proxy workers.
 */
import { DurableObject } from "cloudflare:workers";

// These interfaces mirror the workerd debug port RPC API.
// See https://github.com/cloudflare/workerd/blob/main/src/workerd/server/server.c++
export interface WorkerdDebugPortConnector {
	connect(address: string): WorkerdDebugPortClient;
}

export interface WorkerdDebugPortClient {
	// These return sync Fetchers via Cap'n Proto pipelining — the actual RPC
	// resolution is deferred until the Fetcher is first used (e.g. fetch()).
	getEntrypoint(
		service: string,
		entrypoint?: string,
		props?: Record<string, unknown>
	): Fetcher;
	getActor(service: string, entrypoint: string, actorId: string): Fetcher;
}

export interface RegistryEntry {
	debugPortAddress: string;
	defaultEntrypointService: string;
	userWorkerService: string;
}

// Module-level registry map. Populated and kept current via setRegistry()
// when Miniflare pushes data through the entry socket.
let registry = new Map<string, RegistryEntry>();

/**
 * Replace the in-memory registry map with new data. Called by the proxy
 * worker's default fetch handler when Miniflare pushes an update.
 */
export function setRegistry(data: Record<string, RegistryEntry>): void {
	registry = new Map(Object.entries(data));
}

/**
 * Resolve a worker name to its registry entry.
 */
export function resolveTarget(service: string): RegistryEntry | null {
	return registry.get(service) ?? null;
}

/**
 * Connect to a Durable Object actor on a remote workerd instance via the debug port.
 * All calls are synchronous via Cap'n Proto pipelining — the actual network
 * round-trip is deferred until the returned Fetcher is first used.
 */
export function connectToActor(
	debugPort: WorkerdDebugPortConnector,
	scriptName: string,
	className: string,
	actorId: string
): Fetcher | null {
	const target = resolveTarget(scriptName);
	if (!target) {
		return null;
	}
	const client = debugPort.connect(target.debugPortAddress);
	// DOs are defined on the user worker, not behind the assets/vite proxy.
	return client.getActor(target.userWorkerService, className, actorId);
}

export function createProxyDurableObjectClass({
	scriptName,
	className,
}: {
	scriptName: string;
	className: string;
}): typeof DurableObject {
	return class extends DurableObject {
		_debugPort: WorkerdDebugPortConnector;
		_actorId: string;

		constructor(
			ctx: DurableObjectState,
			env: { DEV_REGISTRY_DEBUG_PORT: WorkerdDebugPortConnector }
		) {
			super(ctx, env);
			this._debugPort = env.DEV_REGISTRY_DEBUG_PORT;
			this._actorId = ctx.id.toString();

			return new Proxy(this, {
				get(target, prop) {
					if (Reflect.has(target, prop)) {
						return Reflect.get(target, prop);
					}
					const fetcher = connectToActor(
						target._debugPort,
						scriptName,
						className,
						target._actorId
					);
					if (!fetcher) {
						return () => {
							throw new Error(
								`Cannot access "${String(prop)}" as we couldn't find a local dev session for Durable Object "${className}" of service "${scriptName}" to proxy to.`
							);
						};
					}
					return Reflect.get(fetcher, prop);
				},
			});
		}

		async fetch(request: Request): Promise<Response> {
			const fetcher = connectToActor(
				this._debugPort,
				scriptName,
				className,
				this._actorId
			);
			if (!fetcher) {
				return new Response(
					`Couldn't find a local dev session for Durable Object "${className}" of service "${scriptName}" to proxy to`,
					{ status: 503 }
				);
			}
			return fetcher.fetch(request);
		}
	} as unknown as typeof DurableObject;
}

const SERIALIZED_DATE = "___serialized_date___";
const SERIALIZED_BIGINT = "___serialized_bigint___";

export function tailEventsReplacer(_: string, value: any) {
	if (value instanceof Date) {
		return { [SERIALIZED_DATE]: value.toISOString() };
	} else if (typeof value === "bigint") {
		return { [SERIALIZED_BIGINT]: value.toString() };
	}
	return value;
}

export function tailEventsReviver(_: string, value: any) {
	if (value && typeof value === "object") {
		if (SERIALIZED_DATE in value) {
			return new Date(value[SERIALIZED_DATE]);
		} else if (SERIALIZED_BIGINT in value) {
			return BigInt(value[SERIALIZED_BIGINT]);
		}
	}
	return value;
}
