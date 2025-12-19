interface QueueJob {
	key: string;
	value: string;
}
declare namespace Cloudflare {
	interface Env {
		QUEUE_PRODUCER: Queue<QueueJob>;
		QUEUE_RESULTS: KVNamespace;
	}
}
