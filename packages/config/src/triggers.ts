// ═══════════════════════════════════════════════════════════════════════════
// TRIGGERS API
// Named types and helper factories for declaring event triggers.
// ═══════════════════════════════════════════════════════════════════════════

interface FetchTriggerOptions {
	/**
	 * A route that your Worker should be published to.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#types-of-routes
	 */
	pattern: string;
	/**
	 * The DNS zone the pattern is attached to. Required when the
	 * pattern is ambiguous.
	 */
	zone?: string;
}

/**
 * Fetch trigger — a route that your Worker should be published to.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#types-of-routes
 */
export interface FetchTrigger extends FetchTriggerOptions {
	type: "fetch";
}

interface QueueConsumerTriggerOptions {
	/** The name of the queue from which this consumer should consume. */
	name: string;
	/** The queue to send messages that failed to be consumed. */
	deadLetterQueue?: string;
	/** The maximum number of messages per batch. */
	maxBatchSize?: number;
	/** The maximum number of seconds to wait to fill a batch with messages. */
	maxBatchTimeout?: number;
	/**
	 * The maximum number of concurrent consumer Worker invocations.
	 * Leaving this unset will allow your consumer to scale to the
	 * maximum concurrency needed to keep up with the message backlog.
	 */
	maxConcurrency?: number | null;
	/** The maximum number of retries for each message. */
	maxRetries?: number;
	/** The number of seconds to wait before retrying a message. */
	retryDelay?: number;
	/** The number of milliseconds to wait for pulled messages to become visible again. */
	visibilityTimeoutMs?: number;
}

/**
 * Queue consumer trigger — invokes this Worker when messages arrive on the
 * named queue.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#queues
 */
export interface QueueConsumerTrigger extends QueueConsumerTriggerOptions {
	type: "queue";
}

interface ScheduledTriggerOptions {
	/**
	 * A "cron" definition to trigger a Worker's "scheduled" function.
	 *
	 * Lets you call Workers periodically, much like a cron job.
	 *
	 * More details here https://developers.cloudflare.com/workers/platform/cron-triggers
	 */
	schedule: string;
}

/**
 * Scheduled (cron) trigger — invokes this Worker on the given schedules.
 *
 * More details here https://developers.cloudflare.com/workers/platform/cron-triggers
 */
export interface ScheduledTrigger extends ScheduledTriggerOptions {
	type: "scheduled";
}

/**
 * Event triggers — fetch routes, queue consumers, and cron schedules
 * — that invoke this Worker. Construct entries with `triggers.fetch(...)`,
 * `triggers.queue(...)`, or `triggers.scheduled(...)`.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#triggers
 */
export interface Triggers {
	/**
	 * Fetch trigger — a route that your Worker should be published to.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#types-of-routes
	 */
	fetch(options: FetchTriggerOptions): FetchTrigger;
	/**
	 * Queue consumer trigger — invokes this Worker when messages arrive on the
	 * named queue.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#queues
	 */
	queue(options: QueueConsumerTriggerOptions): QueueConsumerTrigger;
	/**
	 * Scheduled (cron) trigger — invokes this Worker on the given schedules.
	 *
	 * More details here https://developers.cloudflare.com/workers/platform/cron-triggers
	 */
	scheduled(options: ScheduledTriggerOptions): ScheduledTrigger;
}

/**
 * Triggers builder for configuring event triggers.
 *
 * @example
 * ```typescript
 * import { defineWorker, triggers } from "@cloudflare/config";
 *
 * export default defineWorker({
 *   triggers: [
 *     triggers.fetch({ pattern: "example.com/*", zone: "example.com" }),
 *     triggers.queue({ name: "my-queue" }),
 *     triggers.scheduled({ schedule: "0 * * * *" }),
 *     triggers.scheduled({ schedule: "30 0 * * *" }),
 *   ],
 * });
 * ```
 */
export const triggers: Triggers = {
	fetch: (options) => ({ type: "fetch", ...options }),
	queue: (options) => ({ type: "queue", ...options }),
	scheduled: (options) => ({ type: "scheduled", ...options }),
};
