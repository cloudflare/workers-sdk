declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./index");
		durableNamespaces: "Counter" | "ConfiguredVirtualDurableObject";
	}
	interface Env {
		NAME: string;
		AUXILIARY_WORKER: Fetcher;
	}
}
interface Env extends Cloudflare.Env {}
