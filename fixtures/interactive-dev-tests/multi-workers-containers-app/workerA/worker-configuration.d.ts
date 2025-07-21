declare namespace Cloudflare {
	interface Env {
		CONTAINER: DurableObjectNamespace<import(".").FixtureTestContainer>;
		WORKER_B: Fetcher;
	}
}
interface Env extends Cloudflare.Env {}
