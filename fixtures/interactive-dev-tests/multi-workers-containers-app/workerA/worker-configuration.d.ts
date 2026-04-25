interface InternalEnv {
	CONTAINER_A: DurableObjectNamespace<import(".").FixtureTestContainerA>;
	WORKER_B: Fetcher;
}
declare namespace Cloudflare {
	interface Env extends InternalEnv {}
}
interface Env extends InternalEnv {}
