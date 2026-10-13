import { WorkerEntrypoint } from "cloudflare:workers";
import type { ArtifactsEvent } from "../artifacts/events";

/** Private RPC entrypoint for locally produced Artifacts events. */
export class ArtifactsEventProducer extends WorkerEntrypoint {
	/** Accept an event; delivery will be implemented with subscriptions. */
	async sendEvent(_event: ArtifactsEvent): Promise<void> {
		// No consumer exists yet.
	}
}
