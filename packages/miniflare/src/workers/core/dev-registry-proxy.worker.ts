import { WorkerEntrypoint } from "cloudflare:workers";
import {
	resolveTarget,
	tailEventsReplacer,
	tailEventsReviver,
} from "./dev-registry-proxy-shared.worker";
import type { WorkerdDebugPortConnector } from "./dev-registry-proxy-shared.worker";

// Re-export for the dynamic main module (which generates DO proxy classes
// and the registry update handler). Since esbuild bundles the shared module
// into this file, the dynamic module imports these from here so everything
// shares the same module-level registry Map.
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

export class ExternalServiceProxy extends WorkerEntrypoint<Env> {
	_props: Props;

	constructor(ctx: ExecutionContext, env: Env) {
		super(ctx, env);
		this._props = (ctx as unknown as { props: Props }).props;

		return new Proxy(this, {
			get(target, prop) {
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}
				const fetcher = target._resolve();
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

	_resolve(): Fetcher | null {
		const { service, entrypoint } = this._props;
		const target = resolveTarget(service);
		if (!target) {
			return null;
		}
		const serviceName =
			entrypoint === null || entrypoint === "default"
				? target.defaultEntrypointService
				: target.userWorkerService;
		const client = this.env.DEV_REGISTRY_DEBUG_PORT.connect(
			target.debugPortAddress
		);
		return client.getEntrypoint(serviceName, entrypoint ?? undefined);
	}

	async fetch(request: Request): Promise<Response> {
		const fetcher = this._resolve();
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
		// Fetcher.scheduled() is a protocol method not available over debug port RPC,
		// so we forward via HTTP to the entry service's /cdn-cgi/handler/scheduled route.
		const { service, entrypoint } = this._props;
		const target = resolveTarget(service);
		if (!target) {
			throw new Error(
				`Couldn't find a local dev session for the "${entrypoint ?? "default"}" entrypoint of service "${service}" to proxy to`
			);
		}

		const client = this.env.DEV_REGISTRY_DEBUG_PORT.connect(
			target.debugPortAddress
		);
		const fetcher = client.getEntrypoint(ENTRY_SERVICE_NAME);
		const params = new URLSearchParams();
		if (controller.cron) {
			params.set("cron", controller.cron);
		}
		if (controller.scheduledTime) {
			params.set("time", String(controller.scheduledTime));
		}
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
			const fetcher = this._resolve();
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
