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

const ENTRY_SERVICE_NAME = "core:entry";

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
	// Must use _ prefix, not #private — private fields are not accessible
	// through a JS Proxy, and the constructor returns a Proxy wrapping `this`.
	_props: Props;

	constructor(ctx: ExecutionContext, env: Env) {
		super(ctx, env);
		this._props = (ctx as unknown as { props: Props }).props;

		return new Proxy(this, {
			get(target, prop) {
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}
				const fetcher = resolve(target._props, target.env);
				if (!fetcher) {
					if (prop === "fetch") {
						return () => {
							const { service, entrypoint } = target._props;
							return new Response(
								`Couldn't find a local dev session for the "${entrypoint ?? "default"}" entrypoint of service "${service}" to proxy to`,
								{ status: 503 }
							);
						};
					}
					return () => {
						const { service, entrypoint } = target._props;
						throw new Error(
							`Cannot access "${String(prop)}" as we couldn't find a local dev session for the "${entrypoint ?? "default"}" entrypoint of service "${service}" to proxy to.`
						);
					};
				}
				return Reflect.get(fetcher, prop);
			},
		});
	}

	async fetch(request: Request): Promise<Response> {
		const fetcher = resolve(this._props, this.env);
		if (!fetcher) {
			const { service, entrypoint } = this._props;
			return new Response(
				`Couldn't find a local dev session for the "${entrypoint ?? "default"}" entrypoint of service "${service}" to proxy to`,
				{ status: 503 }
			);
		}
		return fetcher.fetch(request);
	}

	async scheduled(controller: ScheduledController) {
		const params = new URLSearchParams();
		if (controller.cron) {
			params.set("cron", controller.cron);
		}
		if (controller.scheduledTime) {
			params.set("time", String(controller.scheduledTime));
		}
		const target = resolveTarget(this._props.service);
		if (!target) {
			const { service, entrypoint } = this._props;
			throw new Error(
				`Couldn't find a local dev session for the "${entrypoint ?? "default"}" entrypoint of service "${service}" to proxy to`
			);
		}
		const client = this.env.DEV_REGISTRY_DEBUG_PORT.connect(
			target.debugPortAddress
		);
		const fetcher = client.getEntrypoint(ENTRY_SERVICE_NAME);
		const response = await fetcher.fetch(
			`http://localhost/cdn-cgi/handler/scheduled?${params}`
		);
		if (!response.ok) {
			const body = await response.text();
			throw new Error(
				`Scheduled handler returned HTTP ${response.status}: ${body}`
			);
		}
	}

	tail(events: TraceItem[]) {
		try {
			const fetcher = resolve(this._props, this.env);
			if (!fetcher) {
				return;
			}
			const serializedEvents = JSON.parse(
				JSON.stringify(events, tailEventsReplacer),
				tailEventsReviver
			);
			// @ts-expect-error .tail is not in the `Fetcher` type but it's a valid RPC call
			return fetcher.tail(serializedEvents);
		} catch (e) {
			console.warn(
				`[dev-registry] Failed to forward tail events to "${this._props.service}": ${e instanceof Error ? e.message : String(e)}`
			);
		}
	}

	async queue(_batch: MessageBatch): Promise<void> {
		throw new Error(
			`Calling "queue" on a cross-process service binding is not yet supported`
		);
	}
}
