/**
 * Shared utilities for the dev-registry proxy workers.
 */
import { DurableObject } from "cloudflare:workers";

// These interfaces mirror the workerd debug port RPC API.
// See https://github.com/cloudflare/workerd/blob/main/src/workerd/server/server.c++
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
	defaultEntrypointService: string;
	userWorkerService: string;
}

export interface ProxyEnv {
	DEV_REGISTRY: Fetcher;
	DEV_REGISTRY_DEBUG_PORT: WorkerdDebugPortConnector;
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
 * Creates a Proxy handler that forwards arbitrary RPC method calls and property
 * access through an async fetcher. Each property access returns a callable+thenable
 * value to support both `stub.method()` and `await stub.property`.
 *
 * The async fetcher is needed because the remote is resolved via the debug port
 * at call time — there's no static target to Reflect.get against.
 */
export function createRpcProxyHandler<T extends object>(
	getFetcher: () => Promise<Fetcher>,
	errorContext: string
): ProxyHandler<T> {
	return {
		get(target, prop) {
			if (Reflect.has(target, prop)) {
				const value = Reflect.get(target, prop);
				if (typeof value === "function") {
					return value.bind(target);
				}
				return value;
			}
			if (typeof prop === "string") {
				const methodName = prop;
				const rpcCall = async function (...args: unknown[]) {
					const fetcher = await getFetcher();
					const method = (
						fetcher as unknown as Record<string, (...a: unknown[]) => unknown>
					)[methodName];
					if (typeof method !== "function") {
						throw new Error(
							`Method "${methodName}" not found on ${errorContext}`
						);
					}
					return Reflect.apply(method, fetcher, args);
				};
				rpcCall.then = (
					resolve: (v: unknown) => void,
					reject: (e: unknown) => void
				) => {
					getFetcher()
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
	};
}

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
			const getFetcher = async (): Promise<Fetcher> => {
				const fetcher = await connectToActor(
					env,
					scriptName,
					className,
					ctx.id.toString()
				);
				if (!fetcher) {
					throw new Error(
						`Couldn't find a local dev session for Durable Object "${className}" of service "${scriptName}" to proxy to`
					);
				}
				return fetcher;
			};
			return new Proxy(
				this,
				createRpcProxyHandler(
					getFetcher,
					`remote Durable Object "${className}" of service "${scriptName}"`
				)
			);
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
