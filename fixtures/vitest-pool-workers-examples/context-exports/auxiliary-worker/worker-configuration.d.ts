interface BaseEnv {
	NAME: string;
}
declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./index");
	}
	interface Env extends BaseEnv {}
}
interface Env extends BaseEnv {}
