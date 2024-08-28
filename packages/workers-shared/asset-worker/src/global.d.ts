type Env = {
	// ASSETS_MANIFEST is a pipeline binding to an ArrayBuffer containing the
	// binary-encoded site manifest
	ASSETS_MANIFEST: ArrayBuffer;

	// ASSETS_KV_NAMESPACE is a pipeline binding to the KV namespace that the
	// assets are in.
	ASSETS_KV_NAMESPACE: KVNamespace;
};
