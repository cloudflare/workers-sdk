import { WorkerEntrypoint } from "cloudflare:workers";
import type RouterWorker from "@cloudflare/workers-shared/asset-worker";

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

	async scheduled(controller: ScheduledController) {
		// Forward the scheduled event to the user worker.
		// The RPC proxy only intercepts fetch (routing through the asset router)
		// and tail — all other lifecycle events go directly to the user worker.
		// Use Fetcher.scheduled() with a plain object since ScheduledController
		// has non-serializable methods (like noRetry()).
		const result = await (this.env.USER_WORKER as Fetcher).scheduled({
			scheduledTime: new Date(controller.scheduledTime),
			cron: controller.cron,
		});
		if (result.outcome !== "ok") {
			throw new Error(
				`User worker scheduled handler failed: ${result.outcome}`
			);
		}
	}

	async queue(_batch: MessageBatch): Promise<void> {
		// Not implemented yet: forwarding queue messages requires a way to get a
		// remote `Queue` object over the debug port RPC, which isn't possible yet.
		// For now, this will fail with an error if called.
		throw new Error(
			`Calling "queue" on a cross-process service binding is not yet supported`
		);
	}

	tail(events: TraceItem[]) {
		// Temporary workaround: the tail events is not serializable over capnproto yet
		// But they are effectively JSON, so we are serializing them to JSON and parsing it back to make it transferable.
		// @ts-expect-error FIXME when https://github.com/cloudflare/workerd/pull/4595 lands
		return this.env.USER_WORKER.tail(
			JSON.parse(JSON.stringify(events, tailEventsReplacer), tailEventsReviver)
		);
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
				return Reflect.get(target.env.USER_WORKER, prop);
			},
		});
	}
}

// NOTE: These helpers are duplicated in core/dev-registry-proxy-shared.worker.ts.
// They're kept separate because these workers are bundled independently.
const serializedDate = "___serialized_date___";
const serializedBigInt = "___serialized_bigint___";

function tailEventsReplacer(_: string, value: any) {
	// The tail events might contain Date objects which will not be restored directly
	if (value instanceof Date) {
		return { [serializedDate]: value.toISOString() };
	} else if (typeof value === "bigint") {
		return { [serializedBigInt]: value.toString() };
	}
	return value;
}

function tailEventsReviver(_: string, value: any) {
	// To restore Date objects from the serialized events
	if (value && typeof value === "object") {
		if (serializedDate in value) {
			return new Date(value[serializedDate]);
		} else if (serializedBigInt in value) {
			return BigInt(value[serializedBigInt]);
		}
	}

	return value;
}
