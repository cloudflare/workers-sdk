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

export class ExternalServiceProxy extends WorkerEntrypoint<Env, Props> {
	_fetcher: Fetcher | null = null;
	_entryFetcher: Fetcher | null = null;

	constructor(ctx: ExecutionContext<Props>, env: Env) {
		super(ctx, env);
		this._fetcher = resolve(ctx.props, env);

		// Separate connection for scheduled: the debug port's EventDispatcher
		// doesn't support runScheduled/runAlarm/queue, so we forward via HTTP.
		const target = resolveTarget(ctx.props.service);
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
					throw new Error(
						`Cannot access "${String(prop)}" as we couldn't find a local dev session for the "${ctx.props.entrypoint ?? "default"}" entrypoint of service "${ctx.props.service}" to proxy to.`
					);
				}
				return Reflect.get(target._fetcher, prop);
			},
		});
	}

	async fetch(request: Request): Promise<Response> {
		if (!this._fetcher) {
			return new Response(
				`Couldn't find a local dev session for the "${this.ctx.props.entrypoint ?? "default"}" entrypoint of service "${this.ctx.props.service}" to proxy to`,
				{ status: 503 }
			);
		}
		return this._fetcher.fetch(request);
	}

	async scheduled(controller: ScheduledController) {
		if (!this._entryFetcher) {
			throw new Error(
				`Couldn't find a local dev session for the "${this.ctx.props.entrypoint ?? "default"}" entrypoint of service "${this.ctx.props.service}" to proxy to`
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

	// Filter rpcMethod==="tail" to prevent infinite recursion.
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
			console.warn(
				`[dev-registry] Failed to forward tail events to "${this.ctx.props.service}": ${e instanceof Error ? e.message : String(e)}`
			);
		}
	}
}
