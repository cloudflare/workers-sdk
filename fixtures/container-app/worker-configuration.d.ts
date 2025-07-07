declare namespace Cloudflare {
	interface Env {
		CONTAINER: DurableObjectNamespace<import("./src").Container>;
	}
}
interface Env extends Cloudflare.Env {}
