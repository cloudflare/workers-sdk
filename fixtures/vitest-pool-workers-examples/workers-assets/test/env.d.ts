declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("../src");
	}
	interface Env {
		ASSETS: Fetcher;
	}
}
