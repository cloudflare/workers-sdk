declare namespace Cloudflare {
	interface Env {
		CONFIG: Record<string, string>;
		ASSETS_MANIFEST: ArrayBuffer;
		ASSETS_KV_NAMESPACE: KVNamespace;
	}
}
