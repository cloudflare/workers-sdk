import { WorkerEntrypoint } from "cloudflare:workers";
import { tailEventsReplacer, tailEventsReviver } from "./tail-events";

interface Env {
	ENTRY_USER_WORKER: Service<WorkerEntrypoint>;
	__VITE_MIDDLEWARE__: Fetcher;
}

export default class ViteProxyWorker extends WorkerEntrypoint<Env> {
	constructor(ctx: ExecutionContext, env: Env) {
		super(ctx, env);
		return new Proxy(this, {
			get(target, prop) {
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}

				return Reflect.get(target.env.ENTRY_USER_WORKER, prop);
			},
		});
	}

	override async fetch(request: Request) {
		// Upgrade requests (e.g. WebSocket) cannot be proxied through the
		// Node.js middleware binding, so send them directly to the user worker.
		if (request.headers.get("Upgrade")) {
			return this.env.ENTRY_USER_WORKER.fetch(request);
		}

		return this.env.__VITE_MIDDLEWARE__.fetch(request);
	}

	override tail(events: TraceItem[]) {
		// Temporary workaround: the tail events is not serializable over capnproto yet
		// But they are effectively JSON, so we are serializing them to JSON and parsing it back to make it transferable.
		// @ts-expect-error FIXME when https://github.com/cloudflare/workerd/pull/4595 lands
		return this.env.ENTRY_USER_WORKER.tail(
			JSON.parse(JSON.stringify(events, tailEventsReplacer), tailEventsReviver)
		);
	}
}
