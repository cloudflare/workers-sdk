interface BaseEnv {
	NAME: string;
}
declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./index");
		durableNamespaces: "Counter" | "ConfiguredVirtualDurableObject";
	}
	interface Env extends BaseEnv {}
}
interface Env extends BaseEnv {}
