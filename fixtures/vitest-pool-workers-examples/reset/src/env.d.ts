/* eslint-disable */
declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./index");
		durableNamespaces: "Counter";
	}
	interface Env {
		COUNTER: DurableObjectNamespace<import("./index").Counter>;
		KV_NAMESPACE: KVNamespace;
		R2_BUCKET: R2Bucket;
		DATABASE: D1Database;
	}
}
interface Env extends Cloudflare.Env {}
