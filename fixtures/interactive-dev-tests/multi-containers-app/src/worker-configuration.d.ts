declare namespace Cloudflare {
	interface Env {
		CONTAINER_A: DurableObjectNamespace<import("./src").FixtureTestContainerA>;
		CONTAINER_B: DurableObjectNamespace<import("./src").FixtureTestContainerB>;
	}
}

interface Env extends Cloudflare.Env {}
