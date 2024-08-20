type Environment = "production" | "local";

type Env = {
	ASSETS_MANIFEST: ArrayBuffer;
	ASSETS_KV_NAMESPACE: KVNamespace;
	ENVIRONMENT: Environment;
};

type BodyEncoding = "manual" | "automatic";

interface ResponseInit {
	encodeBody?: BodyEncoding;
}

interface KVNamespace {
	getWithMetadata<Metadata = unknown>(
		key: string,
		type: "stream"
	): KVValueWithMetadata<ReadableStream, Metadata>;
	getWithMetadata<Metadata = unknown>(
		key: string,
		options?: {
			type: "stream";
			cacheTtl?: number;
		}
	): KVValueWithMetadata<ReadableStream, Metadata>;
}

type KVValueWithMetadata<Value, Metadata> = Promise<{
	value: Value | null;
	metadata: Metadata | null;
}>;
