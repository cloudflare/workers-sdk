declare namespace Cloudflare {
	interface Env {
		CONTAINER: DurableObjectNamespace<import("./index").FixtureTestContainer>;
	}
}
interface Env extends Cloudflare.Env {}
