declare namespace Cloudflare {
	interface Env {
		CONTAINER_B: DurableObjectNamespace<import(".").FixtureTestContainerB>;
	}
}
interface Env extends Cloudflare.Env {}
