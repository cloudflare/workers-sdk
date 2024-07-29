interface QueueJob {
	key: string;
	value: string;
}

interface Env {
	QUEUE_PRODUCER: Queue<QueueJob>;
	QUEUE_RESULTS: KVNamespace;
}
