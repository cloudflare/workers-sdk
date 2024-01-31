interface Env {
	TEST_NAMESPACE: KVNamespace;
	COUNTER: DurableObjectNamespace;
	OTHER: DurableObjectNamespace;
	SELF: Fetcher;
}

declare module "cloudflare:test" {
	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	interface ProvidedEnv extends Env {}
}
