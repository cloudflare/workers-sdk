interface CloudflareTestEnv {
	TEST_NAMESPACE: KVNamespace;
	COUNTER: DurableObjectNamespace;
	OTHER: DurableObjectNamespace;
	SELF: Fetcher;
}
