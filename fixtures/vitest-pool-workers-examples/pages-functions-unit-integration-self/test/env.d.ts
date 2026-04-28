declare namespace Cloudflare {
	interface GlobalProps {
		// Pages Functions compile to a worker with an ExportedHandler default export
		mainModule: { default: ExportedHandler<Cloudflare.Env> };
	}
	interface Env {
		KV_NAMESPACE: KVNamespace;
		ASSETS: Fetcher;
	}
}
