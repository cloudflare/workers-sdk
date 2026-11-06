import { ArtifactsEventTypeSchema } from "@cloudflare/config";
import { z } from "zod";
import { getArtifactsEventSourceType } from "../workers/artifacts/events";
import type { ArtifactsEventType } from "../workers/artifacts/events";

// Kept separate from `schema.ts` so the v4 option schemas can use these without
// importing Worker scripts.

/**
 * Delivers local Artifacts events to a queue, like a Queues event subscription
 * with an Artifacts source. Subscriptions belong to the account, so they are
 * configured for the whole instance rather than for one Worker.
 */
export const ArtifactsEventSubscriptionSchema = z
	.strictObject({
		queue: z.string().min(1),
		source: z.discriminatedUnion("type", [
			z.strictObject({ type: z.literal("artifacts") }),
			z.strictObject({
				type: z.literal("artifacts.repo"),
				namespace: z.string().min(1),
				repoName: z.string().min(1),
			}),
		]),
		/** Defaults to every event type the source publishes. */
		events: z.array(ArtifactsEventTypeSchema).min(1).optional(),
	})
	.superRefine((subscription, ctx) => {
		for (const [index, type] of (subscription.events ?? []).entries()) {
			if (getArtifactsEventSourceType(type) !== subscription.source.type) {
				ctx.addIssue({
					code: "custom",
					path: ["events", index],
					message: `Event "${type}" is not published by the "${subscription.source.type}" source.`,
				});
			}
		}
	});

/** Delivers local Artifacts events to a queue. */
export interface ArtifactsEventSubscription {
	/** Queue receiving the events. */
	queue: string;
	/** Every repository in the instance, or one repository. */
	source:
		| { type: "artifacts" }
		| { type: "artifacts.repo"; namespace: string; repoName: string };
	/** Defaults to every event type the source publishes. */
	events?: ArtifactsEventType[];
}
