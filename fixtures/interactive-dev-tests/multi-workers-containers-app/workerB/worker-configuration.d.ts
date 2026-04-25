interface InternalEnv {
	CONTAINER_B: DurableObjectNamespace<import(".").FixtureTestContainerB>;
}
declare namespace Cloudflare {
	interface Env extends InternalEnv {}
}
interface Env extends InternalEnv {}
