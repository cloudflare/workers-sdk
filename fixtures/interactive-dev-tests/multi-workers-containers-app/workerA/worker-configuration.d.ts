interface BaseEnv {
	CONTAINER_A: DurableObjectNamespace<import(".").FixtureTestContainerA>;
	WORKER_B: Fetcher;
}
declare namespace Cloudflare {
	interface Env extends BaseEnv {}
}
interface Env extends BaseEnv {}
