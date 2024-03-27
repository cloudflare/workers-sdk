type Runtime = import("@astrojs/cloudflare").AdvancedRuntime<Env>;

declare namespace App {
	interface Locals extends Runtime {}
}
