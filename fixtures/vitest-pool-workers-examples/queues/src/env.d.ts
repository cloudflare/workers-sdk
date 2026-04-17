interface QueueJob {
	key: string;
	value: string;
}

declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./index");
	}
	interface Env {
		QUEUE_RESULTS: KVNamespace;
		QUEUE_PRODUCER: Queue<QueueJob>;
	}
}
interface Env extends Cloudflare.Env {}
