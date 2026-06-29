interface Env {
	// Service binding to the dev-registry proxy's `ExternalServiceProxy`,
	// configured with props pointing at the remote queue's broker service.
	OUTBOUND: Fetcher;
	// The forwarded queue's service name (e.g. `queues:queue:my-queue`), used
	// only to identify the queue in dropped-message diagnostics.
	QUEUE_SERVICE: string;
}

// Mirrors the broker's "no consumer, drop" response shape so a producer's
// `.send()` succeeds even when the consumer process isn't running, the same as
// the local no-consumer behaviour (see broker.worker.ts `message`/`batch`).
const DROPPED_RESPONSE = {
	metadata: {
		metrics: { backlogCount: 0, backlogBytes: 0, oldestMessageTimestamp: 0 },
	},
};

// Forwards a producer's queue HTTP request (`/message` or `/batch`, with the
// native workerd queue producer's serialized body and `X-Msg-*` headers intact)
// to a consumer running in another `wrangler dev` process, via the dev-registry
// proxy. Used in place of the in-process broker `objectEntryWorker` when a
// produced queue's consumer lives in a different Miniflare instance.
export default <ExportedHandler<Env>>{
	async fetch(request, env) {
		// Buffer the body before forwarding. If the consumer process isn't
		// running, the proxy returns a 503 without draining the request body;
		// passing the original streaming request through would then hang the
		// producer's `.send()` on the unconsumed pipe. A buffered body can be
		// discarded cleanly. Bytes (and so the `X-Msg-Fmt` content type) are
		// preserved exactly. The queue producer only ever sends POSTs, so
		// unconditionally buffering is safe.
		const forwarded = new Request(request.url, {
			method: request.method,
			headers: request.headers,
			body: await request.arrayBuffer(),
		});

		try {
			const response = await env.OUTBOUND.fetch(forwarded);
			// A 503 means the proxy couldn't resolve the consumer process. Drop the
			// message (mirroring a missing local consumer) so `.send()` still
			// succeeds, but log it so the drop isn't invisible. The proxy returns
			// 503 for two distinct reasons (see `workerNotFoundMessage` in
			// dev-registry-proxy-shared.worker.ts): the consumer isn't running yet
			// (a routine startup race, logged at debug), or running on an
			// incompatible version (an actionable misconfig, logged as a warning).
			if (response.status === 503) {
				const reason = await response.text().catch(() => "");
				const message = `[queues] dropped a message for "${env.QUEUE_SERVICE}": ${reason || "consumer process not running"}`;
				if (reason.includes("not compatible")) {
					console.warn(message);
				} else {
					console.debug(message);
				}
				return Response.json(DROPPED_RESPONSE);
			}
			return response;
		} catch (e) {
			// An unexpected forwarding failure (proxy crash, RPC error, ...), as
			// opposed to the routine "consumer not up yet" 503 above. Still drop to
			// keep `.send()` non-throwing, but warn since it may indicate a real bug.
			console.warn(
				`[queues] failed to forward a message for "${env.QUEUE_SERVICE}", dropping it: ${e instanceof Error ? e.message : String(e)}`
			);
			return Response.json(DROPPED_RESPONSE);
		}
	},
};
