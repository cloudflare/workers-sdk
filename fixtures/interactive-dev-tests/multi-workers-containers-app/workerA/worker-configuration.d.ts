declare namespace Cloudflare {
	interface Env {
		CONTAINER_A: DurableObjectNamespace<import(".").FixtureTestContainerA>;
		WORKER_B: Fetcher;
	}
}
interface Env extends Cloudflare.Env {}
