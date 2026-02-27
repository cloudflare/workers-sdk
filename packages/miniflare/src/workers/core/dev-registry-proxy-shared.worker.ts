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

export function setRegistry(data: Record<string, RegistryEntry>): void {
	registry = new Map(Object.entries(data));
}

export function resolveTarget(service: string): RegistryEntry | undefined {
	return registry.get(service);
}

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
	return class extends DurableObject<{
		DEV_REGISTRY_DEBUG_PORT: WorkerdDebugPortConnector;
	}> {
		constructor(
			ctx: DurableObjectState,
			env: { DEV_REGISTRY_DEBUG_PORT: WorkerdDebugPortConnector }
		) {
			super(ctx, env);

			return new Proxy(this, {
				get(target, prop) {
					if (Reflect.has(target, prop)) {
						return Reflect.get(target, prop);
					}
					const fetcher = connectToActor(
						target.env.DEV_REGISTRY_DEBUG_PORT,
						scriptName,
						className,
						target.ctx.id.toString()
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
				this.env.DEV_REGISTRY_DEBUG_PORT,
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
