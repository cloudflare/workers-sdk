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

interface EmailTriggerOptions {
	/**
	 * Inbound Email Routing addresses handled by this Worker.
	 *
	 * Each entry is a literal recipient address (e.g. `"support@example.com"`)
	 * or a `*@domain` catch-all (e.g. `"*@example.com"`).
	 */
	addresses: string[];
}

/**
 * Email trigger — invokes this Worker for the configured Email Routing
 * addresses.
 */
export interface EmailTrigger extends EmailTriggerOptions {
	type: "email";
}

interface ConnectTriggerOptions {
	/** The transport protocol to listen for. */
	protocol: "tcp";
	/** The port to listen on. */
	port: number;
	/** The address to bind to. Defaults to `127.0.0.1`. */
	address?: string;
}

/**
 * Connect trigger — invokes this Worker's `connect(socket, env, ctx)`
 * handler for raw socket connections received on the configured
 * protocol/port.
 */
export interface ConnectTrigger extends ConnectTriggerOptions {
	type: "connect";
}

/**
 * Event triggers — fetch routes, queue consumers, cron schedules, Email
 * Routing addresses, and raw sockets — that invoke this Worker.
 * Construct entries with `triggers.fetch(...)`, `triggers.queue(...)`,
 * `triggers.scheduled(...)`, `triggers.email(...)`, or `triggers.connect(...)`.
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
	/**
	 * Email trigger — invokes this Worker for the configured Email Routing
	 * addresses.
	 */
	email(options: EmailTriggerOptions): EmailTrigger;
	/**
	 * Connect trigger — invokes this Worker's `connect(socket, env, ctx)`
	 * handler for raw socket connections received on the configured
	 * protocol/port.
	 */
	connect(options: ConnectTriggerOptions): ConnectTrigger;
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
 *     triggers.email({ addresses: ["support@example.com"] }),
 *     triggers.connect({ protocol: "tcp", port: 5432 }),
 *   ],
 * });
 * ```
 */
export const triggers: Triggers = {
	fetch: (options) => ({ type: "fetch", ...options }),
	queue: (options) => ({ type: "queue", ...options }),
	scheduled: (options) => ({ type: "scheduled", ...options }),
	email: (options) => ({ type: "email", ...options }),
	connect: (options) => ({ type: "connect", ...options }),
};
