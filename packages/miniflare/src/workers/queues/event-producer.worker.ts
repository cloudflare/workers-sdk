import { WorkerEntrypoint } from "cloudflare:workers";
import type { ArtifactsEvent } from "../artifacts/events";
import type { ArtifactsEventInbox } from "./event-inbox.worker";

interface Env {
	ARTIFACTS_NAMESPACE: string;
	EVENT_INBOX: DurableObjectNamespace<ArtifactsEventInbox>;
}

/** Private RPC entrypoint for product events produced by local simulators. */
export class ArtifactsEventProducer extends WorkerEntrypoint<Env> {
	/** Send a canonical Artifacts event to the Queue plugin's private ingress. */
	async sendEvent(event: ArtifactsEvent): Promise<void> {
		const { EVENT_INBOX, ARTIFACTS_NAMESPACE } = this.env;
		await EVENT_INBOX.get(
			EVENT_INBOX.idFromName(ARTIFACTS_NAMESPACE)
		).sendEvent(event);
	}
}
