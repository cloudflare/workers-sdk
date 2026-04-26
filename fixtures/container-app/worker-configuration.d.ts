declare namespace Cloudflare {
	interface Env {
		CONTAINER: DurableObjectNamespace<import("./src").FixtureTestContainer>;
	}
}
interface Env extends Cloudflare.Env {}
