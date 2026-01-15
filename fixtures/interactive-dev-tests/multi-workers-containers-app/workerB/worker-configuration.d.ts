interface BaseEnv {
	CONTAINER_B: DurableObjectNamespace<import(".").FixtureTestContainerB>;
}
declare namespace Cloudflare {
	interface Env extends BaseEnv {}
}
interface Env extends BaseEnv {}
