interface Env {
	KV_NAMESPACE: KVNamespace;
	TEST_OBJECT: DurableObjectNamespace<import("./index").TestObject>;
	TEST_NAMED_HANDLER: Service;
	TEST_NAMED_ENTRYPOINT: Service<import("./index").TestNamedEntrypoint>;
}
