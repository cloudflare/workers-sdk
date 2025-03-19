import { WorkerEntrypoint } from "cloudflare:workers";
import type RouterWorker from "@cloudflare/workers-shared/asset-worker/src/index";

interface Env {
	ROUTER_WORKER: Service<RouterWorker>;
	USER_WORKER: Fetcher | Service;
}

/*
 * The RPCProxyWorker is a Miniflare abstraction of the filter stage used in
 * production Workers + Assets pipelines. It lives in front of the Router Worker,
 * and is meant to redirect incoming `fetch` requests to the Router Worker, and
 * all other RPC requests to the User Worker. It does so via a JSProxy mechanism.
 * The RPCProxyWorker is specifically relevant in the context of
 * Worker <> Worker+Assets service bindings.
 *
 * Please note that this conceptual pipeline architecture is applied only for
 * Workers + Assets and default entrypoints, class or non-class based.
 */
export default class RPCProxyWorker extends WorkerEntrypoint<Env> {
	async fetch(request: Request) {
		return this.env.ROUTER_WORKER.fetch(request);
	}

	constructor(ctx: ExecutionContext, env: Env) {
		super(ctx, env);
		/*
		 * Create a proxy of the RPCProxyWorker instance
		 *
		 * see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy
		 * see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Reflect
		 */
		return new Proxy(this, {
			get(target, prop) {
				/*
				 * If `prop` is defined on the RPCProxyWorker, then we are
				 * intentionally meaning to intercept `env.USER_WORKER[prop]`
				 * calls and override their return value . We should therefore
				 * return whatever `RPCProxyWorker[prop]` returns
				 */
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}

				/*
				 * Otherwise, forward to the USER_WORKER and return its response
				 */
				return function (...args: Array<unknown>) {
					// @ts-expect-error
					return Reflect.apply(target.env.USER_WORKER[prop], target, args);
				};
			},
		});
	}
}
