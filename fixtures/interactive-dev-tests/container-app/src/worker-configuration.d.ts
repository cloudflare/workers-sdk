interface InternalEnv {
	CONTAINER: DurableObjectNamespace<import("./index").FixtureTestContainer>;
}
declare namespace Cloudflare {
	interface Env extends InternalEnv {}
}
interface Env extends InternalEnv {}
