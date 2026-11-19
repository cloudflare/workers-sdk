/**
 * The local observability collector. Miniflare designates it as workerd's OTLP
 * collector (`tracing.otlp`), so workerd POSTs each invocation's spans to its
 * `/v1/traces`, and attaches it to the user's worker(s) as a tail consumer, so
 * workerd delivers each invocation's tail events here. `otlp-to-store.ts` turns
 * the former into spans and `TailToStoreHandler` the latter into logs, which are
 * stored in the `TraceStore` Durable Object hosted by this same worker. The
 * endpoint for querying that store is also defined here.
 */
import { WorkerEntrypoint } from "cloudflare:workers";
import { decodeExportTraceServiceRequest } from "./otlp-to-store";
import { TailToStoreHandler } from "./tail-to-store";
import { TraceStore } from "./trace-store";
import { TraceWriter } from "./trace-writer";
import type { TracedServices } from "./otlp-to-store";

// Re-export so the embedded worker registers the DO class under its namespace.
export { TraceStore };

interface Env {
	TRACE_STORE: DurableObjectNamespace<TraceStore>;
	TRACE_BATCH_SIZE: number;
	TRACED_SERVICES: TracedServices;
}

let writer: TraceWriter | undefined;

export default class LocalObservabilityCollector extends WorkerEntrypoint<Env> {
	tailStream(onset: TailStream.TailEvent<TailStream.Onset>) {
		// Fold this invocation's tail straight into the singleton TraceStore.
		const store = this.env.TRACE_STORE.get(
			this.env.TRACE_STORE.idFromName("singleton")
		);
		writer ??= new TraceWriter(this.env.TRACE_BATCH_SIZE);
		return new TailToStoreHandler(writer, store, onset);
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
		// workerd's OTLP exporter (`tracing.otlp`) posts every traced invocation's
		// spans here.
		if (url.pathname === "/v1/traces" && request.method === "POST") {
			const spans = decodeExportTraceServiceRequest(
				new Uint8Array(await request.arrayBuffer()),
				this.env.TRACED_SERVICES
			);
			if (spans.length > 0) {
				writer ??= new TraceWriter(this.env.TRACE_BATCH_SIZE);
				const owner = writer.createOwner(store);
				for (const span of spans) {
					writer.enqueueCompletedSpan(owner, span);
				}
				await writer.drain(owner);
			}
			// An empty `ExportTraceServiceResponse`.
			return new Response(null, {
				headers: { "content-type": "application/x-protobuf" },
			});
		}
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
			writer ??= new TraceWriter(this.env.TRACE_BATCH_SIZE);
			await writer.clear(store);
			return Response.json({ success: true });
		}
		return new Response("not found", { status: 404 });
	}
}
