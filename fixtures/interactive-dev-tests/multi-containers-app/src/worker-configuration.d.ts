interface BaseEnv {
	CONTAINER_A: DurableObjectNamespace<import("./src").FixtureTestContainerA>;
	CONTAINER_B: DurableObjectNamespace<import("./src").FixtureTestContainerB>;
}

declare namespace Cloudflare {
	interface Env extends BaseEnv {}
}

interface Env extends BaseEnv {}
