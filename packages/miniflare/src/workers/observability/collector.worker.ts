/**
 * Local observability collector (experimental).
 *
 * Registered by Miniflare core as a streaming-tail consumer of the user's
 * worker(s) when local observability is enabled (`X_LOCAL_OBSERVABILITY`).
 * workerd streams each invocation's TailStream events here; `TailToStoreHandler`
 * folds them straight into spans/logs (Workers Observability attribute shape) and
 * persists them to the internal `TraceStore` Durable Object (this same worker
 * hosts that DO and binds to it as `TRACE_STORE`). The read API over the store is
 * also exposed here.
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
		return new TailToStoreHandler(store, onset);
	}

	/**
	 * The read surface over the trace store: a single `POST /query` that runs
	 * read-only SQL against the `spans`/`logs` tables. The Local Explorer's
	 * Observability API proxies to here; the UI's common views and any coding
	 * agent are all just canned/ad-hoc SQL over this one endpoint. Guardrails
	 * (single read-only statement, row cap) live in `TraceStore.query`.
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
		return new Response("not found", { status: 404 });
	}
}
