export const QueueBindings = {
	SERVICE_WORKER_PREFIX: "MINIFLARE_WORKER_",
	MAYBE_JSON_QUEUE_PRODUCERS: "MINIFLARE_QUEUE_PRODUCERS",
	MAYBE_JSON_QUEUE_CONSUMERS: "MINIFLARE_QUEUE_CONSUMERS",
	// Optional service binding to the dev-registry proxy's `ExternalQueueProxy`
	// entrypoint, present when a locally-produced queue may have its consumer in
	// another dev session.
	MAYBE_SERVICE_QUEUE_PROXY: "MINIFLARE_QUEUE_PROXY",
} as const;

// Header carrying the queue name on requests the broker forwards to the
// dev-registry proxy, which resolves the consumer's process from it.
export const HEADER_QUEUE_NAME = "MF-Queue-Name";

// Prefix for the workerd service backing a single queue's broker. Note this
// must match the queues plugin name ("queues"), which lives on the Node.js
// side of the build boundary.
export const SERVICE_QUEUE_PREFIX = "queues:queue";

// The workerd service name backing a single queue's broker. Producers in other
// dev sessions resolve a consumer process's broker by this exact name through
// the dev registry's debug port, so it must be derived in one place rather
// than reconstructed at each call site.
export function getQueueServiceName(queueId: string): string {
	return `${SERVICE_QUEUE_PREFIX}:${queueId}`;
}
