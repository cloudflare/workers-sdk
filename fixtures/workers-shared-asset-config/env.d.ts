declare module "cloudflare:test" {
	// Controls the type of `import("cloudflare:test").env`
	interface ProvidedEnv {
		CONFIG: Record<string, string>;
		ASSETS_MANIFEST: ArrayBuffer;
		ASSETS_KV_NAMESPACE: KVNamespace;
	}
}
