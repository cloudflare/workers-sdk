declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./index");
	}
	interface Env {
		GREETER: DurableObjectNamespace;
	}
}
interface Env extends Cloudflare.Env {}
