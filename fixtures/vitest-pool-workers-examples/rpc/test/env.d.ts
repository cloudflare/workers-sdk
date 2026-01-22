declare namespace Cloudflare {
	interface Env {
		KV_NAMESPACE: KVNamespace;
		TEST_OBJECT: DurableObjectNamespace<import("../src/index").TestObject>;
		TEST_NAMED_HANDLER: Service;
		TEST_NAMED_ENTRYPOINT: Service<import("../src/index").TestNamedEntrypoint>;
	}
	interface GlobalProps {
		mainModule: typeof import("../src/index");
	}
}
