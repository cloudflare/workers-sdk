declare namespace Cloudflare {
	interface Env {
		CONTAINER: DurableObjectNamespace<import("./src/index").Container>;
	}
}
interface Env extends Cloudflare.Env {}
