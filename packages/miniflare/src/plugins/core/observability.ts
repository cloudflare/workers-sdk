import { mkdirSync } from "node:fs";
import SCRIPT_OBSERVABILITY_COLLECTOR from "worker:observability/collector";
import { type Service } from "../../runtime";
import { parseTraceBatchCapacity } from "../../workers/observability/trace-writer";
import { getPersistPath } from "../shared";
import {
	getUserServiceName,
	OBSERVABILITY_COLLECTOR_SERVICE_NAME,
} from "./constants";
import type { TracedServices } from "../../workers/observability/otlp-to-store";

export type { TracedServices };

/**
 * Builds the trace collector service and the storage behind it. workerd exports
 * every traced invocation's spans to the collector over OTLP (Miniflare sets
 * `tracing.otlp` to it), and Miniflare core attaches the collector to the user's
 * worker(s) as a tail consumer for their logs (see the `unsafeObservability`
 * wiring in this plugin). The collector also hosts the `TraceStore` Durable
 * Object and binds to it, so captured spans and logs are saved there for the
 * Local Explorer / `wrangler observability` to read.
 */

/** DO class name — must match the class exported by collector.worker.ts. */
const TRACE_STORE_CLASS_NAME = "TraceStore";
/** Binding name — must match the collector worker's `Env.TRACE_STORE`. */
const TRACE_STORE_BINDING = "TRACE_STORE";
/** Host environment variable used to tune completed-row batch capacity. */
const OBSERVABILITY_BATCH_SIZE_ENV = "X_LOCAL_OBSERVABILITY_BATCH_SIZE";
/** Binding name — must match the collector worker's `Env.TRACE_BATCH_SIZE`. */
const TRACE_BATCH_SIZE_BINDING = "TRACE_BATCH_SIZE";
/** Binding name — must match the collector worker's `Env.TRACED_SERVICES`. */
const TRACED_SERVICES_BINDING = "TRACED_SERVICES";
/** Disk service backing the TraceStore DO's SQLite storage. */
const OBSERVABILITY_STORAGE_SERVICE_NAME = "obs:storage";

export function getObservabilityServices(
	tmpPath: string,
	isolatedResourcePersistencePath: string | undefined,
	runtimeEnv: Record<string, string> | undefined,
	tracedServices: TracedServices
): Service[] {
	// The TraceStore DO is SQLite-backed, so it needs disk-backed storage (the
	// in-memory option doesn't support SQL). Persist under `.wrangler/state` when
	// a persist root is set (so it survives dev-server restarts), otherwise fall
	// back to the instance temp dir. workerd requires the path to exist first.
	const storagePath = getPersistPath(
		"observability",
		tmpPath,
		isolatedResourcePersistencePath
	);
	mkdirSync(storagePath, { recursive: true });
	const batchSize = parseTraceBatchCapacity(
		runtimeEnv?.[OBSERVABILITY_BATCH_SIZE_ENV] ??
			process.env[OBSERVABILITY_BATCH_SIZE_ENV] ??
			null
	);

	return [
		{
			name: OBSERVABILITY_STORAGE_SERVICE_NAME,
			disk: { path: storagePath, writable: true },
		},
		{
			// User workers' `streamingTails` references, and `tracing.otlp`, resolve
			// through getUserServiceName(), so register the collector under that same
			// prefixed name.
			name: getUserServiceName(OBSERVABILITY_COLLECTOR_SERVICE_NAME),
			worker: {
				compatibilityDate: "2026-01-01",
				// The collector consumes tails and spans; it isn't tailed or traced
				// itself, so it doesn't need OBSERVABILITY_COMPAT_FLAGS (those go on
				// the user workers).
				compatibilityFlags: ["nodejs_compat"],
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
					{
						name: TRACE_BATCH_SIZE_BINDING,
						json: JSON.stringify(batchSize),
					},
					{
						name: TRACED_SERVICES_BINDING,
						json: JSON.stringify(tracedServices),
					},
				],
			},
		},
	];
}
