declare module "cloudflare:test" {
	interface ProvidedEnv {
		ASSETS?: Fetcher;
		KV_NAMESPACE: KVNamespace;
		OTHER_OBJECT: DurableObjectNamespace;
	}
}
