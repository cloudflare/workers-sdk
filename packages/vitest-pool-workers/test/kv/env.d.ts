// TODO(soon): move to `declare module` like `vitest` `ProvidedContext`
interface CloudflareTestEnv {
	TEST_NAMESPACE: KVNamespace;
	COUNTER: DurableObjectNamespace;
	OTHER: DurableObjectNamespace;
	SELF: Fetcher;
}
