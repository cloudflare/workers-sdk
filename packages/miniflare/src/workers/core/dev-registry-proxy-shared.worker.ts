import { DurableObject } from "cloudflare:workers";

/**
 * Represents the workerd debug port's ability to open connections to other
 * workerd instances by address. Mirrors the Cap'n Proto RPC interface exposed
 * by the workerd debug port.
 *
 * @see https://github.com/cloudflare/workerd/blob/main/src/workerd/server/server.c++
 */
export interface WorkerdDebugPortConnector {
	connect(address: string): WorkerdDebugPortClient;
}

/**
 * A connected debug port client that can resolve service entrypoints and
 * Durable Object actors on a remote workerd instance.
 */
export interface WorkerdDebugPortClient {
	getEntrypoint(
		service: string,
		entrypoint?: string,
		props?: Record<string, unknown>
	): Fetcher;
	getActor(service: string, entrypoint: string, actorId: string): Fetcher;
}

/**
 * A dev registry entry describing how to reach a worker's debug port and
 * which workerd services correspond to its default entrypoint and user code.
 */
export interface RegistryEntry {
	debugPortAddress: string;
	defaultEntrypointService: string;
	userWorkerService: string;
}

let registry = new Map<string, RegistryEntry>();

/**
 * Replace the in-memory registry with the given entries.
 * Called whenever the Node.js side pushes an updated registry snapshot.
 */
export function setRegistry(data: Record<string, RegistryEntry>): void {
	registry = new Map(Object.entries(data));
}

/**
 * Look up a worker's registry entry by service name.
 */
export function resolveTarget(service: string): RegistryEntry | undefined {
	return registry.get(service);
}

/**
 * Connect to a Durable Object actor on a remote workerd instance via the
 * debug port, returning a {@link Fetcher} that proxies requests to it.
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
	return client.getActor(target.userWorkerService, className, actorId);
}

/**
 * Create a {@link DurableObject} subclass that proxies all method calls
 * and fetch requests to a Durable Object running in a separate workerd
 * instance via the debug port RPC. Uses a {@link Proxy} to forward
 * arbitrary RPC method calls to the remote actor's {@link Fetcher}.
 */
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
		_cachedFetcher: Fetcher | undefined;
		_cachedDebugPortAddress: string | undefined;

		// Lazily resolve and cache. Invalidates when debugPortAddress changes.
		_resolve(): Fetcher | null {
			const target = resolveTarget(scriptName);
			if (
				this._cachedFetcher &&
				target?.debugPortAddress === this._cachedDebugPortAddress
			) {
				return this._cachedFetcher;
			}
			this._cachedFetcher = undefined;
			this._cachedDebugPortAddress = undefined;

			const fetcher = connectToActor(
				this.env.DEV_REGISTRY_DEBUG_PORT,
				scriptName,
				className,
				this.ctx.id.toString()
			);
			if (fetcher && target) {
				this._cachedFetcher = fetcher;
				this._cachedDebugPortAddress = target.debugPortAddress;
			}
			return fetcher;
		}

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
				const fetcher = target._resolve();
					if (!fetcher) {
						return () => {
							throw new Error(
								`Worker "${scriptName}" not found. Make sure it is running locally.`
							);
						};
					}
					return Reflect.get(fetcher, prop);
				},
			});
		}

		fetch(request: Request): Promise<Response> {
			const fetcher = this._resolve();
			if (!fetcher) {
				return Promise.resolve(
					new Response(
					`Worker "${scriptName}" not found. Make sure it is running locally.`,
					{ status: 503 }
					)
				);
			}
			return fetcher.fetch(request);
		}
	} as unknown as typeof DurableObject;
}

const SERIALIZED_DATE = "___serialized_date___";
const SERIALIZED_BIGINT = "___serialized_bigint___";

/**
 * JSON replacer that serializes `Date` and `bigint` values into tagged
 * objects so they survive a JSON round-trip in tail event forwarding.
 */
export function tailEventsReplacer(_: string, value: any) {
	if (value instanceof Date) {
		return { [SERIALIZED_DATE]: value.toISOString() };
	} else if (typeof value === "bigint") {
		return { [SERIALIZED_BIGINT]: value.toString() };
	}
	return value;
}

/**
 * JSON reviver that restores `Date` and `bigint` values from the tagged
 * objects produced by {@link tailEventsReplacer}.
 */
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
