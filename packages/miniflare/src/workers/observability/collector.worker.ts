/**
 * Local observability collector (experimental) — PLACEHOLDER.
 *
 * Injected automatically when local observability is enabled
 * (`X_LOCAL_OBSERVABILITY`) and registered by Miniflare core as a streaming-tail
 * consumer of the user's worker(s). For now this only proves the wiring: workerd
 * streams each invocation's TailStream events here. Capturing the spans/logs and
 * persisting them to the internal trace store lands in a follow-up change.
 */
import { WorkerEntrypoint } from "cloudflare:workers";

export default class LocalObservabilityCollector extends WorkerEntrypoint {
	tailStream() {
		// Returning a handler (even a no-op) opts this worker into receiving the
		// streamed tail for each invocation; capture + persist is added next.
		return () => {};
	}
}
