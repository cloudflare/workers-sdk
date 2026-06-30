/**
 * Local observability collector (experimental).
 *
 * Registered by Miniflare core as a streaming-tail consumer of the user's
 * worker(s) when local observability is enabled (`X_LOCAL_OBSERVABILITY`).
 * workerd streams each invocation's TailStream events here.
 *
 * This change lands the storage half: the collector hosts the internal
 * `TraceStore` Durable Object (an internal SQLite store) and binds to it as
 * `TRACE_STORE`, and exposes a read API over it. Capturing the TailStream into
 * spans/logs and persisting them lands in a follow-up, so `tailStream` is a
 * no-op placeholder for now.
 */
import { WorkerEntrypoint } from "cloudflare:workers";
import { TraceStore } from "./trace-store";

// Re-export so the embedded worker registers the DO class under its namespace.
export { TraceStore };

interface Env {
	TRACE_STORE: DurableObjectNamespace<TraceStore>;
}

export default class LocalObservabilityCollector extends WorkerEntrypoint<Env> {
	tailStream() {
		// Returning a handler (even a no-op) opts this worker into receiving the
		// streamed tail for each invocation. Folding those events into spans/logs
		// and persisting them to TRACE_STORE is added in a follow-up change.
		return () => {};
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
