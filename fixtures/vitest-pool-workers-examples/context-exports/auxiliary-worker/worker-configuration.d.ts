interface InternalEnv {
	NAME: string;
}
declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./index");
	}
	interface Env extends InternalEnv {}
}
interface Env extends InternalEnv {}
