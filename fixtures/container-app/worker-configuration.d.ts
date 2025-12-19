interface BaseEnv {
	CONTAINER: DurableObjectNamespace<import("./src").FixtureTestContainer>;
}
declare namespace Cloudflare {
	interface Env extends BaseEnv {}
}
interface Env extends BaseEnv {}
