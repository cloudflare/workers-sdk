import { mkdirSync } from "node:fs";
import path from "node:path";
import {
	OBSERVABILITY_COLLECTOR_SERVICE_NAME,
	OBSERVABILITY_COMPAT_FLAGS,
} from "@cloudflare/workers-utils";
import SCRIPT_OBSERVABILITY_COLLECTOR from "worker:observability/collector";
import { type Service } from "../../runtime";
import { getUserServiceName } from "./constants";

/**
 * Local observability (experimental).
 *
 * Builds the internal trace collector service. Miniflare core registers it as a
 * streaming-tail consumer of the user's worker(s) (see the `unsafeObservability`
 * wiring in this plugin), so it receives each invocation's tail. The same worker
 * also hosts the `TraceStore` Durable Object (an internal SQLite store) and binds
 * to it, so captured spans/logs are persisted there for the Local Explorer /
 * `wrangler observability` to read.
 */

/** DO class name — must match the class exported by collector.worker.ts. */
const TRACE_STORE_CLASS_NAME = "TraceStore";
/** Binding name — must match the collector worker's `Env.TRACE_STORE`. */
const TRACE_STORE_BINDING = "TRACE_STORE";
/** Disk service backing the TraceStore DO's SQLite storage. */
const OBSERVABILITY_STORAGE_SERVICE_NAME = "miniflare-observability-storage";

export function getObservabilityServices(tmpPath: string): Service[] {
	// The TraceStore DO is SQLite-backed, which requires disk-backed storage (the
	// in-memory option doesn't support SQL). Keep it under the instance's temp dir
	// for now — ephemeral per dev session; persisting to .wrangler/state so the
	// CLI can read it across runs is a follow-up. workerd requires the path to
	// exist before it starts.
	const storagePath = path.join(tmpPath, "observability");
	mkdirSync(storagePath, { recursive: true });

	return [
		{
			name: OBSERVABILITY_STORAGE_SERVICE_NAME,
			disk: { path: storagePath, writable: true },
		},
		{
			// User workers' `streamingTails` references resolve through
			// getUserServiceName(), so register the collector under that same
			// prefixed name.
			name: getUserServiceName(OBSERVABILITY_COLLECTOR_SERVICE_NAME),
			worker: {
				compatibilityDate: "2026-01-01",
				compatibilityFlags: ["nodejs_compat", ...OBSERVABILITY_COMPAT_FLAGS],
				modules: [
					{
						name: "collector.worker.js",
						esModule: SCRIPT_OBSERVABILITY_COLLECTOR(),
					},
				],
				durableObjectNamespaces: [
					{
						className: TRACE_STORE_CLASS_NAME,
						uniqueKey: "miniflare-wobs-trace-store",
						enableSql: true,
						preventEviction: true,
					},
				],
				durableObjectStorage: { localDisk: OBSERVABILITY_STORAGE_SERVICE_NAME },
				bindings: [
					{
						name: TRACE_STORE_BINDING,
						durableObjectNamespace: { className: TRACE_STORE_CLASS_NAME },
					},
				],
			},
		},
	];
}
