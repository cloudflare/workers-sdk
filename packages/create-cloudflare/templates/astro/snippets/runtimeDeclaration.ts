type Runtime = import("@astrojs/cloudflare").DirectoryRuntime<Env>;
declare namespace App {
	interface Locals extends Runtime {}
}
