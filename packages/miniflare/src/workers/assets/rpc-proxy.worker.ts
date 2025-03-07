import { WorkerEntrypoint } from "cloudflare:workers";
import type RouterWorker from "@cloudflare/workers-shared/asset-worker/src/index";

interface Env {
	ROUTER_WORKER: Service<RouterWorker>;
	USER_WORKER: Fetcher;
}
export default class RPCProxyWorker extends WorkerEntrypoint<Env> {
	async fetch(request: Request) {
		return this.env.ROUTER_WORKER.fetch(request);
	}

	constructor(ctx: ExecutionContext, env: Env) {
		super(ctx, env);
		// create a proxy for the RPCProxyWorker instance
		return new Proxy(this, {
			/**
			 * target = this = RPCProxyWorker instance
			 * prop = fetch/tail/trace/tailStream/scheduled/alarm/self/webSocketMessage/webSocketError/env/??
			 */
			get(target, prop) {
				/*
				 * If `prop` is defined on the RPCProxyWorker instance, go ahead
				 * and return that value. This basically allows us to override
				 * props defined on the USER_WORKER's default export.
				 */
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}

				/*
				 * Otherwise, return the USER_WORKER value
				 */
				return function (...args: Array<unknown>) {
					// @ts-ignore to figure out
					return Reflect.apply(target.env.USER_WORKER[prop], target, args);
				};
			},
		});
	}
}
