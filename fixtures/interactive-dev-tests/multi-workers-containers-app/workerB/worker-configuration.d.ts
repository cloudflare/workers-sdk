declare namespace Cloudflare {
	interface Env {
		CONTAINER: DurableObjectNamespace<import(".").FixtureTestContainer>;
	}
}
interface Env extends Cloudflare.Env {}
