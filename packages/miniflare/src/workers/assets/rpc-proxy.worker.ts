import { WorkerEntrypoint } from "cloudflare:workers";
import {
	tailEventsReplacer,
	tailEventsReviver,
} from "../core/dev-registry-proxy-shared.worker";
import type RouterWorker from "@cloudflare/workers-shared/asset-worker";

interface Env {
	ROUTER_WORKER: Service<RouterWorker>;
	USER_WORKER: Fetcher | Service;
}

export default class RPCProxyWorker extends WorkerEntrypoint<Env> {
	async fetch(request: Request) {
		return this.env.ROUTER_WORKER.fetch(request);
	}

	tail(events: TraceItem[]) {
		// @ts-expect-error FIXME when https://github.com/cloudflare/workerd/pull/4595 lands
		return this.env.USER_WORKER.tail(
			JSON.parse(JSON.stringify(events, tailEventsReplacer), tailEventsReviver)
		);
	}

	constructor(ctx: ExecutionContext, env: Env) {
		super(ctx, env);
		return new Proxy(this, {
			get(target, prop) {
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}
				return Reflect.get(target.env.USER_WORKER, prop);
			},
		});
	}
}
