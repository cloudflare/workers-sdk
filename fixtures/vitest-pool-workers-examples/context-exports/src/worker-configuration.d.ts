declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./index");
		durableNamespaces: "Counter" | "ConfiguredVirtualDurableObject";
	}
	interface Env {
		NAME: string;
	}
}
interface Env extends Cloudflare.Env {}
