import { WorkerEntrypoint } from "cloudflare:workers";
import {
	createRpcProxyHandler,
	resolveTarget,
	tailEventsReplacer,
	tailEventsReviver,
} from "./dev-registry-proxy-shared.worker";
import type { ProxyEnv } from "./dev-registry-proxy-shared.worker";

const ENTRY_SERVICE_NAME = "core:entry";

export const DevRegistryProxyBindings = {
	DEBUG_PORT: "DEV_REGISTRY_DEBUG_PORT",
	DEV_REGISTRY: "DEV_REGISTRY",
} as const;

type Env = ProxyEnv;

interface Props {
	service: string;
	entrypoint: string | null;
}

export class ExternalServiceProxy extends WorkerEntrypoint<Env> {
	_props: Props;

	#remoteFetcherPromise: Promise<Fetcher> | undefined;
	#remoteFetcherPromiseTimestamp = 0;

	constructor(ctx: ExecutionContext, env: Env) {
		super(ctx, env);
		this._props = (ctx as unknown as { props: Props }).props;

		return new Proxy(
			this,
			createRpcProxyHandler(
				() => this.#getRemoteFetcher(),
				`remote service "${this._props.service}"`
			)
		);
	}

	async #getRemoteFetcher(): Promise<Fetcher> {
		if (
			this.#remoteFetcherPromise !== undefined &&
			Date.now() - this.#remoteFetcherPromiseTimestamp < 1000
		) {
			return this.#remoteFetcherPromise;
		}

		const promise = (async () => {
			const { service, entrypoint } = this._props;
			const target = await resolveTarget(this.env, service);
			if (!target) {
				throw new Error(
					`Couldn't find a local dev session for the "${entrypoint ?? "default"}" entrypoint of service "${service}" to proxy to`
				);
			}

			const serviceName =
				entrypoint === null || entrypoint === "default"
					? target.defaultEntrypointService
					: target.userWorkerService;
			const client = await this.env.DEV_REGISTRY_DEBUG_PORT.connect(
				target.debugPortAddress
			);
			return client.getEntrypoint(serviceName, entrypoint ?? undefined);
		})();

		this.#remoteFetcherPromise = promise;
		this.#remoteFetcherPromiseTimestamp = Date.now();

		promise.catch(() => {
			if (this.#remoteFetcherPromise === promise) {
				this.#remoteFetcherPromise = undefined;
				this.#remoteFetcherPromiseTimestamp = 0;
			}
		});

		return promise;
	}

	async fetch(request: Request): Promise<Response> {
		try {
			const fetcher = await this.#getRemoteFetcher();
			return await fetcher.fetch(request);
		} catch (e) {
			const { service, entrypoint } = this._props;
			const message = e instanceof Error ? e.message : String(e);
			if (message.startsWith("Couldn't find")) {
				return new Response(message, { status: 503 });
			} else {
				return new Response(
					`Error connecting to service "${service}" for entrypoint "${entrypoint}": ${message}`,
					{ status: 502 }
				);
			}
		}
	}

	async scheduled(controller: ScheduledController) {
		// Fetcher.scheduled() is a protocol method not available over debug port RPC,
		// so we forward via HTTP to the entry service's /cdn-cgi/handler/scheduled route.
		const { service, entrypoint } = this._props;
		const target = await resolveTarget(this.env, service);
		if (!target) {
			throw new Error(
				`Couldn't find a local dev session for the "${entrypoint ?? "default"}" entrypoint of service "${service}" to proxy to`
			);
		}

		try {
			const client = await this.env.DEV_REGISTRY_DEBUG_PORT.connect(
				target.debugPortAddress
			);
			const fetcher = await client.getEntrypoint(ENTRY_SERVICE_NAME);
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
		} catch (e) {
			throw new Error(
				`Error calling "scheduled" on the "${entrypoint ?? "default"}" entrypoint of service "${service}": ${e instanceof Error ? e.message : String(e)}`
			);
		}
	}

	async tail(events: TraceItem[]) {
		try {
			const fetcher = await this.#getRemoteFetcher();
			const serializedEvents = JSON.parse(
				JSON.stringify(events, tailEventsReplacer),
				tailEventsReviver
			);
			const tailMethod = (
				fetcher as unknown as Record<string, (...a: unknown[]) => unknown>
			)["tail"];
			if (typeof tailMethod === "function") {
				await Reflect.apply(tailMethod, fetcher, [serializedEvents]);
			}
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

export default <ExportedHandler<Env>>{
	async fetch() {
		return new Response("dev-registry-proxy: use named entrypoints", {
			status: 404,
		});
	},
};
