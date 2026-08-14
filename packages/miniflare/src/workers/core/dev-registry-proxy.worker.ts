import { WorkerEntrypoint } from "cloudflare:workers";
import { getQueueServiceName, HEADER_QUEUE_NAME } from "../queues/constants";
import { CorePaths, STORAGE_OWNER_WORKER_NAME } from "./constants";
import {
	findQueueConsumer,
	resolveTarget,
	tailEventsReplacer,
	tailEventsReviver,
	workerNotFoundMessage,
} from "./dev-registry-proxy-shared.worker";
import type { WorkerdDebugPortConnector } from "./dev-registry-proxy-shared.worker";

export {
	createProxyDurableObjectClass,
	setRegistry,
} from "./dev-registry-proxy-shared.worker";

const HANDLER_RESERVED_KEYS = new Set([
	"alarm",
	"connect",
	"self",
	"tail",
	"tailStream",
	"test",
	"trace",
	"webSocketClose",
	"webSocketError",
	"webSocketMessage",
]);

interface Env {
	DEV_REGISTRY_DEBUG_PORT: WorkerdDebugPortConnector;
}

interface Props {
	service: string;
	entrypoint: string | null;
	// User-supplied `props` from the original service binding / tail consumer.
	// Forwarded to the remote entrypoint via the debug port so they are
	// available as `ctx.props` on the callee.
	userProps?: Record<string, unknown>;
}

function resolve(props: Props, env: Env): Fetcher | null {
	const { service, entrypoint, userProps } = props;
	const target = resolveTarget(service);
	if (!target || !target.debugPortAddress) {
		return null;
	}
	const serviceName =
		entrypoint === null || entrypoint === "default"
			? target.defaultEntrypointService
			: target.userWorkerService;
	const client = env.DEV_REGISTRY_DEBUG_PORT.connect(target.debugPortAddress);
	return client.getEntrypoint(serviceName, entrypoint ?? undefined, userProps);
}

/**
 * Relays a queue broker's `/message` or `/batch` request to the dev session
 * consuming that queue. The queue name comes from a request header (rather
 * than binding props) because the broker serves every queue in its process
 * through a single binding. Responds with 503 when no running dev session
 * advertises a consumer for the queue, in which case the sending broker drops
 * the message, mirroring the local no-consumer behaviour.
 */
export class ExternalQueueProxy extends WorkerEntrypoint<Env> {
	fetch(request: Request): Promise<Response> | Response {
		const queueName = request.headers.get(HEADER_QUEUE_NAME);
		if (queueName === null) {
			return new Response(`Missing "${HEADER_QUEUE_NAME}" header`, {
				status: 400,
			});
		}

		const target = findQueueConsumer(queueName);
		if (target === undefined) {
			return new Response(
				`No Worker consuming queue "${queueName}" found in the local dev registry. Make sure the consumer Worker is running locally.`,
				{ status: 503 }
			);
		}

		const client = this.env.DEV_REGISTRY_DEBUG_PORT.connect(
			target.debugPortAddress
		);
		const broker = client.getEntrypoint(getQueueServiceName(queueName));
		const headers = new Headers(request.headers);
		headers.delete(HEADER_QUEUE_NAME);
		return broker.fetch(new Request(request, { headers }));
	}
}

export class ExternalServiceProxy extends WorkerEntrypoint<Env, Props> {
	_fetcher: Fetcher | null = null;
	_entryFetcher: Fetcher | null = null;

	constructor(ctx: ExecutionContext<Props>, env: Env) {
		super(ctx, env);
		this._fetcher = resolve(ctx.props, env);

		// Separate connection for scheduled: the debug port's EventDispatcher
		// doesn't support runScheduled/runAlarm/queue, so we forward via HTTP.
		const target = resolveTarget(ctx.props.service);
		if (target && target.debugPortAddress) {
			const client = env.DEV_REGISTRY_DEBUG_PORT.connect(
				target.debugPortAddress
			);
			this._entryFetcher = client.getEntrypoint("core:entry");
		}

		return new Proxy(this, {
			get(target, prop) {
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}
				if (typeof prop === "string" && HANDLER_RESERVED_KEYS.has(prop)) {
					return undefined;
				}

				if (!target._fetcher) {
					throw new Error(workerNotFoundMessage(ctx.props.service));
				}
				return Reflect.get(target._fetcher, prop);
			},
		});
	}

	fetch(request: Request): Promise<Response> | Response {
		if (!this._fetcher) {
			return new Response(workerNotFoundMessage(this.ctx.props.service), {
				status: 503,
			});
		}
		return this._fetcher.fetch(request);
	}

	async scheduled(controller: ScheduledController) {
		if (!this._entryFetcher) {
			throw new Error(workerNotFoundMessage(this.ctx.props.service));
		}
		const params = new URLSearchParams();
		if (controller.cron) {
			params.set("cron", controller.cron);
		}
		if (controller.scheduledTime) {
			params.set("time", String(controller.scheduledTime));
		}
		const response = await this._entryFetcher.fetch(
			new Request(`http://localhost${CorePaths.SCHEDULED}?${params}`, {
				headers: { "MF-Route-Override": this.ctx.props.service },
			})
		);
		if (!response.ok) {
			const body = await response.text();
			throw new Error(
				`Scheduled handler returned HTTP ${response.status}: ${body}`
			);
		}
	}

	// Forward tail events to the remote worker via RPC.
	// Events with rpcMethod==="tail" are filtered out to prevent infinite
	// recursion (the remote tail() call would itself produce a tail event).
	async tail(events: TraceItem[]) {
		if (!this._fetcher) {
			return;
		}
		const filtered = events.filter(
			(e) => (e.event as { rpcMethod?: string } | null)?.rpcMethod !== "tail"
		);
		if (filtered.length === 0) {
			return;
		}
		try {
			const serializedEvents = JSON.parse(
				JSON.stringify(filtered, tailEventsReplacer),
				tailEventsReviver
			);
			// `await` rather than `return`: the RPC rejects when the peer's debug
			// port has gone away, and returning the promise leaves that rejection
			// outside this `try`, so it escapes as an unhandled rejection instead of
			// being reported.
			// @ts-expect-error .tail is not in the `Fetcher` type but it's a valid RPC call
			await this._fetcher.tail(serializedEvents);
		} catch (e) {
			console.warn(
				`[dev-registry] Failed to forward tail events to "${
					this.ctx.props.service
				}": ${e instanceof Error ? e.message : String(e)}`
			);
		}
	}
}

/**
 * Props carried by a storage binding routed to the shared storage owner. The
 * proxy resolves the owner from the dev registry (by its well-known name) and
 * `getEntrypoint`s the named owner service over the debug port, forwarding
 * `userProps` into the callee's `ctx.props` (e.g. the resource id read by
 * `object-entry.worker.ts`).
 */
interface StorageProps {
	/** The workerd service name on the owner process to target. */
	ownerService: string;
	/** Optional named entrypoint of that service (RPC-type resources). */
	ownerEntrypoint?: string;
	/** Props forwarded to the owner service as `ctx.props`. */
	userProps?: Record<string, unknown>;
}

/**
 * Client-side proxy for the shared storage owner. Every routed storage binding
 * (KV / R2 / D1 / Images fetch, Streams / Secrets RPC) points here; the proxy
 * connects to the owner's debug port and forwards both fetch and arbitrary RPC
 * calls to the owner's real storage service. Resolved lazily per use so the
 * owner restarting (new debug port) is picked up automatically.
 */
export class StorageOwnerProxy extends WorkerEntrypoint<Env, StorageProps> {
	_cachedFetcher: Fetcher | undefined;
	_cachedDebugPortAddress: string | undefined;

	_resolve(): Fetcher | null {
		const target = resolveTarget(STORAGE_OWNER_WORKER_NAME);
		if (!target || !target.debugPortAddress) {
			this._cachedFetcher = undefined;
			this._cachedDebugPortAddress = undefined;
			return null;
		}
		if (
			this._cachedFetcher &&
			target.debugPortAddress === this._cachedDebugPortAddress
		) {
			return this._cachedFetcher;
		}
		const client = this.env.DEV_REGISTRY_DEBUG_PORT.connect(
			target.debugPortAddress
		);
		const fetcher = client.getEntrypoint(
			this.ctx.props.ownerService,
			this.ctx.props.ownerEntrypoint,
			this.ctx.props.userProps
		);
		this._cachedFetcher = fetcher;
		this._cachedDebugPortAddress = target.debugPortAddress;
		return fetcher;
	}

	constructor(ctx: ExecutionContext<StorageProps>, env: Env) {
		super(ctx, env);

		return new Proxy(this, {
			get(target, prop) {
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}
				const fetcher = target._resolve();
				if (!fetcher) {
					// Return a function-that-throws rather than throwing in the get
					// trap: workerd probes properties (fetch, etc.) and throwing here
					// would crash those internal checks.
					return () => {
						throw new Error(workerNotFoundMessage(STORAGE_OWNER_WORKER_NAME));
					};
				}
				return Reflect.get(fetcher, prop);
			},
		});
	}

	fetch(request: Request): Promise<Response> | Response {
		const fetcher = this._resolve();
		if (!fetcher) {
			return new Response(workerNotFoundMessage(STORAGE_OWNER_WORKER_NAME), {
				status: 503,
			});
		}
		return fetcher.fetch(request);
	}
}
