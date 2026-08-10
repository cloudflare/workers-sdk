/**
 * The local observability collector. Miniflare attaches it to the user's
 * worker(s) as a tail consumer, so workerd delivers each invocation's tail events
 * here. `TailToStoreHandler` converts them into spans and logs, which are stored
 * in the `TraceStore` Durable Object hosted by this same worker. The endpoint for
 * querying that store is also defined here.
 */
import { WorkerEntrypoint } from "cloudflare:workers";
import { TailToStoreHandler } from "./tail-to-store";
import { TraceStore } from "./trace-store";

// Re-export so the embedded worker registers the DO class under its namespace.
export { TraceStore };

interface Env {
	TRACE_STORE: DurableObjectNamespace<TraceStore>;
}

export default class LocalObservabilityCollector extends WorkerEntrypoint<Env> {
	tailStream(onset: TailStream.TailEvent<TailStream.Onset>) {
		// Fold this invocation's tail straight into the singleton TraceStore.
		const store = this.env.TRACE_STORE.get(
			this.env.TRACE_STORE.idFromName("singleton")
		);
		// Miniflare core passes the source worker's name in binding props (workerd
		// doesn't surface it on the tail onset locally), so captured spans can be
		// attributed to the right worker.
		const worker = (this.ctx.props as { worker?: string } | undefined)?.worker;
		return new TailToStoreHandler(store, onset, worker);
	}

	/**
	 * Reads from the trace store. A single `POST /query` runs read-only SQL against
	 * the `spans` and `logs` tables. The Local Explorer's Observability API
	 * forwards requests here, so the UI's built-in views and any coding agent all
	 * go through this one endpoint. The query validation lives in
	 * `TraceStore.query`.
	 */
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const store = this.env.TRACE_STORE.get(
			this.env.TRACE_STORE.idFromName("singleton")
		);
		if (url.pathname === "/query" && request.method === "POST") {
			const { sql, params } = (await request.json()) as {
				sql?: string;
				params?: SqlStorageValue[];
			};
			if (typeof sql !== "string") {
				return Response.json({ error: "missing 'sql'" }, { status: 400 });
			}
			try {
				return Response.json(await store.query(sql, params ?? []));
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return Response.json({ error: message }, { status: 400 });
			}
		}
		// Delete all captured spans and logs. Separate from the read-only `/query`
		// path on purpose — this is the one mutation the store exposes.
		if (url.pathname === "/clear" && request.method === "POST") {
			await store.clear();
			return Response.json({ success: true });
		}
		return new Response("not found", { status: 404 });
	}
}
