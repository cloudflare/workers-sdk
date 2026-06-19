import {
	OBSERVABILITY_COLLECTOR_SERVICE_NAME,
	OBSERVABILITY_D1_BINDING,
	OBSERVABILITY_D1_ID,
} from "@cloudflare/workers-utils";
import SCRIPT_OBSERVABILITY_COLLECTOR from "worker:observability/collector";
import { type Service, type Worker_Binding } from "../../runtime";
import { getUserBindingServiceName } from "../shared";
import { getUserServiceName } from "./constants";

/**
 * Local observability (experimental).
 *
 * Injects the trace collector as an internal worker. `wrangler dev` / the Vite
 * plugin register it as a streaming-tail consumer of the user's worker(s) and
 * provision an internal `WOBS_TRACES` D1 database; the collector persists each
 * trace there, and the Local Explorer's Observability tab reads it.
 */

/**
 * Build the collector service. The internal D1 store is provisioned by the dev
 * layer (added to the user worker's d1Databases), so its binding is already in
 * `proxyBindings`; we re-use it here to give the collector write access.
 */
export function getObservabilityServices(): Service[] {
	// Construct the D1 binding to the internal trace-store database. The D1
	// simulator service is created by the d1 plugin because the dev layer adds
	// OBSERVABILITY_D1_BINDING to the user worker's d1Databases.
	const bindings: Worker_Binding[] = [
		{
			name: OBSERVABILITY_D1_BINDING,
			wrapped: {
				moduleName: "cloudflare-internal:d1-api",
				innerBindings: [
					{
						name: "fetcher",
						service: {
							name: getUserBindingServiceName("d1:db", OBSERVABILITY_D1_ID),
						},
					},
				],
			},
		},
	];

	return [
		{
			// User workers' `streamingTails` references are resolved through
			// getUserServiceName(), so register the collector under that same
			// prefixed name so the reference resolves.
			name: getUserServiceName(OBSERVABILITY_COLLECTOR_SERVICE_NAME),
			worker: {
				compatibilityDate: "2026-01-01",
				compatibilityFlags: [
					"nodejs_compat",
					"streaming_tail_worker",
					"tail_worker_user_spans",
				],
				modules: [
					{
						name: "collector.worker.js",
						esModule: SCRIPT_OBSERVABILITY_COLLECTOR(),
					},
				],
				bindings,
			},
		},
	];
}
