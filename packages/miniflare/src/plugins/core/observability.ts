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
 * wiring in this plugin), so it receives each invocation's tail. For now the
 * collector is a placeholder; persisting captured traces to an internal store
 * lands in a follow-up change.
 */
export function getObservabilityServices(): Service[] {
	return [
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
			},
		},
	];
}
