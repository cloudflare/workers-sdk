interface InternalEnv {
	NAME: string;
	AUXILIARY_WORKER: Fetcher;
}
declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./index");
		durableNamespaces: "Counter" | "ConfiguredVirtualDurableObject";
	}
	interface Env extends InternalEnv {}
}
interface Env extends InternalEnv {}
