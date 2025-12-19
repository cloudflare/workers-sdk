interface BaseEnv {
	NAME: string;
	AUXILIARY_WORKER: Fetcher;
}
declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./index");
		durableNamespaces: "Counter" | "ConfiguredVirtualDurableObject";
	}
	interface Env extends BaseEnv {}
}
interface Env extends BaseEnv {}
