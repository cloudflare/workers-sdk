import { WorkerEntrypoint } from "cloudflare:workers";
import {
	resolveTarget,
	tailEventsReplacer,
	tailEventsReviver,
} from "./dev-registry-proxy-shared.worker";
import type { WorkerdDebugPortConnector } from "./dev-registry-proxy-shared.worker";

export {
	createProxyDurableObjectClass,
	setRegistry,
} from "./dev-registry-proxy-shared.worker";

const HANDLER_RESERVED_KEYS = new Set([
	"alarm",
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
}

function resolve(props: Props, env: Env): Fetcher | null {
	const { service, entrypoint } = props;
	const target = resolveTarget(service);
	if (!target) {
		return null;
	}
	const serviceName =
		entrypoint === null || entrypoint === "default"
			? target.defaultEntrypointService
			: target.userWorkerService;
	const client = env.DEV_REGISTRY_DEBUG_PORT.connect(target.debugPortAddress);
	return client.getEntrypoint(serviceName, entrypoint ?? undefined);
}

export class ExternalServiceProxy extends WorkerEntrypoint<Env> {
	_fetcher: Fetcher | null = null;
	_entryFetcher: Fetcher | null = null;

	// Capture props from ctx in the constructor and close over it in the
	// Proxy handler. We can't use private fields (#props) because they are
	// not accessible through a JS Proxy (which the constructor returns).
	constructor(ctx: ExecutionContext, env: Env) {
		super(ctx, env);
		const props = (ctx as unknown as { props: Props }).props;
		// Resolved once via capnp pipelining (synchronous) and reused
		// across all requests to this entrypoint instance.
		this._fetcher = resolve(props, env);

		// Separate core:entry connection for the scheduled handler.
		// The debug port's EventDispatcher throws "RPC connections don't
		// yet support this event type" for runScheduled/runAlarm/queue,
		// so we forward scheduled via HTTP to core:entry instead.
		const target = resolveTarget(props.service);
		if (target) {
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
					const { service, entrypoint } = props;
					throw new Error(
						`Cannot access "${String(prop)}" as we couldn't find a local dev session for the "${entrypoint ?? "default"}" entrypoint of service "${service}" to proxy to.`
					);
				}
				return Reflect.get(target._fetcher, prop);
			},
		});
	}

	// Explicit fetch() is required: without it, fetch falls through to the
	// Proxy get trap where Reflect.get(fetcher, "fetch") detaches the native
	// Fetcher method from its `this` context, causing "Illegal invocation".
	async fetch(request: Request): Promise<Response> {
		const props = (this.ctx as unknown as { props: Props }).props;
		if (!this._fetcher) {
			const { service, entrypoint } = props;
			return new Response(
				`Couldn't find a local dev session for the "${entrypoint ?? "default"}" entrypoint of service "${service}" to proxy to`,
				{ status: 503 }
			);
		}
		return this._fetcher.fetch(request);
	}

	// The debug port's EventDispatcher throws "RPC connections don't yet
	// support this event type" for runScheduled, so we forward via HTTP to
	// core:entry's /cdn-cgi/handler/scheduled route instead.
	// MF-Route-Override ensures the entry worker dispatches to the user
	// worker rather than the asset router.
	async scheduled(controller: ScheduledController) {
		const props = (this.ctx as unknown as { props: Props }).props;
		if (!this._entryFetcher) {
			const { service, entrypoint } = props;
			throw new Error(
				`Couldn't find a local dev session for the "${entrypoint ?? "default"}" entrypoint of service "${service}" to proxy to`
			);
		}
		const params = new URLSearchParams();
		if (controller.cron) {
			params.set("cron", controller.cron);
		}
		if (controller.scheduledTime) {
			params.set("time", String(controller.scheduledTime));
		}
		const response = await this._entryFetcher.fetch(
			new Request(`http://localhost/cdn-cgi/handler/scheduled?${params}`, {
				headers: { "MF-Route-Override": props.service },
			})
		);
		if (!response.ok) {
			const body = await response.text();
			throw new Error(
				`Scheduled handler returned HTTP ${response.status}: ${body}`
			);
		}
	}

	// Forward tail events to the target worker via the cached _fetcher.
	// Filter out events where event.rpcMethod === "tail" to prevent infinite
	// recursion: calling .tail() RPC generates a trace event with
	// rpcMethod:"tail" on this worker, which re-triggers tail().
	tail(events: TraceItem[]) {
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
			// @ts-expect-error .tail is not in the `Fetcher` type but it's a valid RPC call
			return this._fetcher.tail(serializedEvents);
		} catch (e) {
			const props = (this.ctx as unknown as { props: Props }).props;
			console.warn(
				`[dev-registry] Failed to forward tail events to "${props.service}": ${e instanceof Error ? e.message : String(e)}`
			);
		}
	}
}
