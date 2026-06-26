import { WorkerEntrypoint } from "cloudflare:workers";
import {
	tailEventsReplacer,
	tailEventsReviver,
} from "../core/dev-registry-proxy-shared.worker";
import { CoreBindings } from "./constants";

type Env = {
	[CoreBindings.SERVICE_INGRESS_FETCH_TARGET]: Fetcher;
	[CoreBindings.SERVICE_INGRESS_RPC_TARGET]: Fetcher | Service;
};

export default class IngressWorker extends WorkerEntrypoint<Env> {
	constructor(ctx: ExecutionContext, env: Env) {
		super(ctx, env);

		return new Proxy(this, {
			get(target, prop) {
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}

				return Reflect.get(
					target.env[CoreBindings.SERVICE_INGRESS_RPC_TARGET],
					prop
				);
			},
		});
	}

	async fetch(request: Request<unknown, IncomingRequestCfProperties>) {
		return this.env[CoreBindings.SERVICE_INGRESS_FETCH_TARGET].fetch(request);
	}

	async scheduled(controller: ScheduledController) {
		const result = await this.env[
			CoreBindings.SERVICE_INGRESS_RPC_TARGET
		].scheduled?.({
			cron: controller.cron,
			scheduledTime: new Date(controller.scheduledTime),
		});
		if (result?.noRetry) {
			controller.noRetry();
		}
		if (result?.outcome !== "ok") {
			throw new Error(
				`The scheduled handler failed with outcome: ${result?.outcome}`
			);
		}
	}

	tail(events: TraceItem[]) {
		// Temporary workaround: the tail events is not serializable over capnproto yet
		// But they are effectively JSON, so we are serializing them to JSON and parsing it back to make it transferable.
		// @ts-expect-error FIXME when https://github.com/cloudflare/workerd/pull/4595 lands
		return this.env.USER_WORKER.tail(
			JSON.parse(JSON.stringify(events, tailEventsReplacer), tailEventsReviver)
		);
	}
}
