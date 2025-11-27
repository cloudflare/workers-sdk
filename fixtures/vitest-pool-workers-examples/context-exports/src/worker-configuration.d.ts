declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./index");
		durableNamespaces: "Counter";
	}
	interface Env {
		NAME: string;
		COUNTER: DurableObjectNamespace<import("./index").Counter>;
	}
}
interface Env extends Cloudflare.Env {}
