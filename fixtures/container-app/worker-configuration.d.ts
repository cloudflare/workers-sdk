interface InternalEnv {
	CONTAINER: DurableObjectNamespace<import("./src").FixtureTestContainer>;
}
declare namespace Cloudflare {
	interface Env extends InternalEnv {}
}
interface Env extends InternalEnv {}
