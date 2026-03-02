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
	// Capture props from ctx in the constructor and close over it in the
	// Proxy handler. We can't use private fields (#props) because they are
	// not accessible through a JS Proxy (which the constructor returns).
	constructor(ctx: ExecutionContext, env: Env) {
		super(ctx, env);
		const props = (ctx as unknown as { props: Props }).props;

		return new Proxy(this, {
			get(target, prop) {
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}
				const fetcher = resolve(props, target.env);
				if (!fetcher) {
					if (prop === "fetch") {
						return () => {
							const { service, entrypoint } = props;
							return new Response(
								`Couldn't find a local dev session for the "${entrypoint ?? "default"}" entrypoint of service "${service}" to proxy to`,
								{ status: 503 }
							);
						};
					}
					const { service, entrypoint } = props;
					throw new Error(
						`Cannot access "${String(prop)}" as we couldn't find a local dev session for the "${entrypoint ?? "default"}" entrypoint of service "${service}" to proxy to.`
					);
				}
				return Reflect.get(fetcher, prop);
			},
		});
	}

	// Explicit fetch() is required: without it, fetch falls through to the
	// Proxy get trap where Reflect.get(fetcher, "fetch") detaches the native
	// Fetcher method from its `this` context, causing "Illegal invocation".
	async fetch(request: Request): Promise<Response> {
		const props = (this.ctx as unknown as { props: Props }).props;
		const fetcher = resolve(props, this.env);
		if (!fetcher) {
			const { service, entrypoint } = props;
			return new Response(
				`Couldn't find a local dev session for the "${entrypoint ?? "default"}" entrypoint of service "${service}" to proxy to`,
				{ status: 503 }
			);
		}
		return fetcher.fetch(request);
	}

	// Fetcher.scheduled() is not available over debug port RPC, so we
	// forward via HTTP to core:entry's /cdn-cgi/handler/scheduled route.
	// We set MF-Route-Override to the script name so the entry worker
	// resolves to the user worker service rather than the asset router
	// (which doesn't have a scheduled handler).
	async scheduled(controller: ScheduledController) {
		const props = (this.ctx as unknown as { props: Props }).props;
		const target = resolveTarget(props.service);
		if (!target) {
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
		const client = this.env.DEV_REGISTRY_DEBUG_PORT.connect(
			target.debugPortAddress
		);
		const fetcher = client.getEntrypoint("core:entry");
		const response = await fetcher.fetch(
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

	tail(events: TraceItem[]) {
		try {
			const props = (this.ctx as unknown as { props: Props }).props;
			const fetcher = resolve(props, this.env);
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
			const props = (this.ctx as unknown as { props: Props }).props;
			console.warn(
				`[dev-registry] Failed to forward tail events to "${props.service}": ${e instanceof Error ? e.message : String(e)}`
			);
		}
	}
}
