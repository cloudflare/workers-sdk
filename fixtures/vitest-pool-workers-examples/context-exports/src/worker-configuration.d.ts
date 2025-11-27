declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./index");
		durableNamespaces: "Counter";
	}
	interface Env {
		NAME: string;
	}
}
interface Env extends Cloudflare.Env {}
