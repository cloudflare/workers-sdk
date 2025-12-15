import { WorkerEntrypoint } from "cloudflare:workers";

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

const serializedDate = "___serialized_date___";

function tailEventsReplacer(_: string, value: unknown) {
	// The tail events might contain Date objects which will not be restored directly
	if (value instanceof Date) {
		return { [serializedDate]: value.toISOString() };
	}
	return value;
}

function tailEventsReviver(_: string, value: unknown) {
	// To restore Date objects from the serialized events
	if (
		value &&
		typeof value === "object" &&
		serializedDate in value &&
		typeof value[serializedDate] === "string"
	) {
		return new Date(value[serializedDate]);
	}

	return value;
}
