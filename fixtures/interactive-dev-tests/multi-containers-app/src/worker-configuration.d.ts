interface InternalEnv {
	CONTAINER_A: DurableObjectNamespace<import("./src").FixtureTestContainerA>;
	CONTAINER_B: DurableObjectNamespace<import("./src").FixtureTestContainerB>;
}

declare namespace Cloudflare {
	interface Env extends InternalEnv {}
}

interface Env extends InternalEnv {}
