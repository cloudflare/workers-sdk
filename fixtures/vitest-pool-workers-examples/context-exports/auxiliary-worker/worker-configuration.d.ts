declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./index");
	}
	interface Env {
		NAME: string;
	}
}
interface Env extends Cloudflare.Env {}
