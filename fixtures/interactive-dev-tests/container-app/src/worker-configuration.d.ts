interface BaseEnv {
	CONTAINER: DurableObjectNamespace<import("./index").FixtureTestContainer>;
}
declare namespace Cloudflare {
	interface Env extends BaseEnv {}
}
interface Env extends BaseEnv {}
