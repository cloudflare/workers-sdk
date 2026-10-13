import { DurableObject } from "cloudflare:workers";
import type { ArtifactsEvent } from "../artifacts/events";

const MAX_RECENT_EVENTS = 32;

/**
 * Private, bounded inspection point for locally produced events. This is not
 * a durable Queue or an event subscription; routing will be added separately.
 */
export class ArtifactsEventInbox extends DurableObject {
	/** Record an event for internal inspection without retaining an unbounded log. */
	async sendEvent(event: ArtifactsEvent): Promise<void> {
		await this.ctx.storage.transaction(async (transaction) => {
			const recent =
				(await transaction.get<ArtifactsEvent[]>("recent-events")) ?? [];
			await transaction.put("recent-events", [
				...recent.slice(1 - MAX_RECENT_EVENTS),
				event,
			]);
		});
	}

	/** Available only through Miniflare's internal Durable Object namespace. */
	override async fetch(request: Request): Promise<Response> {
		if (new URL(request.url).pathname !== "/recent-events") {
			return new Response("Not found", { status: 404 });
		}
		return Response.json(
			(await this.ctx.storage.get<ArtifactsEvent[]>("recent-events")) ?? []
		);
	}
}
