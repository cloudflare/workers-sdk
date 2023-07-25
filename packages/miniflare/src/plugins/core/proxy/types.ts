import { Blob } from "buffer";
import { arrayBuffer } from "stream/consumers";
import { ReadableStream } from "stream/web";
import type {
	Blob as WorkerBlob,
	CacheQueryOptions as WorkerCacheQueryOptions,
	DurableObjectId as WorkerDurableObjectId,
	DurableObjectJurisdiction as WorkerDurableObjectJurisdiction,
	DurableObjectNamespace as WorkerDurableObjectNamespace,
	DurableObjectNamespaceGetDurableObjectOptions as WorkerDurableObjectNamespaceGetDurableObjectOptions,
	DurableObjectStub as WorkerDurableObjectStub,
	File as WorkerFile,
	Headers as WorkerHeaders,
	KVNamespace as WorkerKVNamespace,
	KVNamespaceGetOptions as WorkerKVNamespaceGetOptions,
	KVNamespaceGetWithMetadataResult as WorkerKVNamespaceGetWithMetadataResult,
	R2Bucket as WorkerR2Bucket,
	R2Conditional as WorkerR2Conditional,
	R2HTTPMetadata as WorkerR2HTTPMetadata,
	R2ListOptions as WorkerR2ListOptions,
	R2MultipartOptions as WorkerR2MultipartOptions,
	R2MultipartUpload as WorkerR2MultipartUpload,
	R2Object as WorkerR2Object,
	R2ObjectBody as WorkerR2ObjectBody,
	R2PutOptions as WorkerR2PutOptions,
	R2Range as WorkerR2Range,
	R2UploadedPart as WorkerR2UploadedPart,
	Request as WorkerRequest,
	Response as WorkerResponse,
} from "@cloudflare/workers-types/experimental";
import { File, Headers } from "undici";
import { Request, RequestInfo, RequestInit, Response } from "../../../http";
import { PlatformImpl } from "../../../workers";

export const NODE_PLATFORM_IMPL: PlatformImpl<ReadableStream> = {
	// Node's implementation of these classes don't quite match Workers',
	// but they're close enough for us
	Blob: Blob as unknown as typeof WorkerBlob,
	File: File as unknown as typeof WorkerFile,
	Headers: Headers as unknown as typeof WorkerHeaders,
	Request: Request as unknown as typeof WorkerRequest,
	Response: Response as unknown as typeof WorkerResponse,

	isReadableStream(value): value is ReadableStream {
		return value instanceof ReadableStream;
	},
	bufferReadableStream(stream) {
		return arrayBuffer(stream);
	},
	unbufferReadableStream(buffer) {
		return new Blob([new Uint8Array(buffer)]).stream();
	},
};

// Replacing `Request`, `Response`
export type Cache = {
	delete(
		request: RequestInfo,
		options?: WorkerCacheQueryOptions
	): Promise<boolean>;
	match(
		request: RequestInfo,
		options?: WorkerCacheQueryOptions
	): Promise<Response | undefined>;
	put(request: RequestInfo, response: Response): Promise<void>;
};
export type CacheStorage = {
	open(cacheName: string): Promise<Cache>;
	readonly default: Cache;
};

// Replacing `Request`, `Response`
export type Fetcher = {
	fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
};

// Replacing `Request`, `Response`
export type DurableObjectStub = Omit<WorkerDurableObjectStub, "fetch"> &
	Fetcher;
export type DurableObjectNamespace = Omit<
	WorkerDurableObjectNamespace,
	"get" | "getExisting" | "jurisdiction"
> & {
	get(
		id: WorkerDurableObjectId,
		options?: WorkerDurableObjectNamespaceGetDurableObjectOptions
	): DurableObjectStub;
	getExisting(
		id: WorkerDurableObjectId,
		options?: WorkerDurableObjectNamespaceGetDurableObjectOptions
	): DurableObjectStub;
	jurisdiction(
		jurisdiction: WorkerDurableObjectJurisdiction
	): DurableObjectNamespace;
};

// Replacing `ReadableStream`
export type KVNamespace = Omit<WorkerKVNamespace, "get" | "getWithMetadata"> & {
	get(
		key: string,
		options?: Partial<WorkerKVNamespaceGetOptions<undefined>>
	): Promise<string | null>;
	get(key: string, type: "text"): Promise<string | null>;
	get<ExpectedValue = unknown>(
		key: string,
		type: "json"
	): Promise<ExpectedValue | null>;
	get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
	get(key: string, type: "stream"): Promise<ReadableStream | null>;
	get(
		key: string,
		options?: WorkerKVNamespaceGetOptions<"text">
	): Promise<string | null>;
	get<ExpectedValue = unknown>(
		key: string,
		options?: WorkerKVNamespaceGetOptions<"json">
	): Promise<ExpectedValue | null>;
	get(
		key: string,
		options?: WorkerKVNamespaceGetOptions<"arrayBuffer">
	): Promise<ArrayBuffer | null>;
	get(
		key: string,
		options?: WorkerKVNamespaceGetOptions<"stream">
	): Promise<ReadableStream | null>;

	getWithMetadata<Metadata = unknown>(
		key: string,
		options?: Partial<WorkerKVNamespaceGetOptions<undefined>>
	): Promise<WorkerKVNamespaceGetWithMetadataResult<string, Metadata>>;
	getWithMetadata<Metadata = unknown>(
		key: string,
		type: "text"
	): Promise<WorkerKVNamespaceGetWithMetadataResult<string, Metadata>>;
	getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
		key: string,
		type: "json"
	): Promise<WorkerKVNamespaceGetWithMetadataResult<ExpectedValue, Metadata>>;
	getWithMetadata<Metadata = unknown>(
		key: string,
		type: "arrayBuffer"
	): Promise<WorkerKVNamespaceGetWithMetadataResult<ArrayBuffer, Metadata>>;
	getWithMetadata<Metadata = unknown>(
		key: string,
		type: "stream"
	): Promise<WorkerKVNamespaceGetWithMetadataResult<ReadableStream, Metadata>>;
	getWithMetadata<Metadata = unknown>(
		key: string,
		options: WorkerKVNamespaceGetOptions<"text">
	): Promise<WorkerKVNamespaceGetWithMetadataResult<string, Metadata>>;
	getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
		key: string,
		options: WorkerKVNamespaceGetOptions<"json">
	): Promise<WorkerKVNamespaceGetWithMetadataResult<ExpectedValue, Metadata>>;
	getWithMetadata<Metadata = unknown>(
		key: string,
		options: WorkerKVNamespaceGetOptions<"arrayBuffer">
	): Promise<WorkerKVNamespaceGetWithMetadataResult<ArrayBuffer, Metadata>>;
	getWithMetadata<Metadata = unknown>(
		key: string,
		options: WorkerKVNamespaceGetOptions<"stream">
	): Promise<WorkerKVNamespaceGetWithMetadataResult<ReadableStream, Metadata>>;
};

// Replacing `Headers`, `ReadableStream`, `Blob`
export type R2Object = Omit<WorkerR2Object, "writeHttpMetadata"> & {
	writeHttpMetadata(headers: Headers): void;
};
export type R2ObjectBody = Omit<
	WorkerR2ObjectBody,
	"writeHttpMetadata" | "body" | "blob"
> & {
	writeHttpMetadata(headers: Headers): void;
	get body(): ReadableStream;
	blob(): Promise<Blob>;
};
export type R2GetOptions = {
	onlyIf?: WorkerR2Conditional | Headers;
	range?: WorkerR2Range | Headers;
};
export type R2PutOptions = Omit<
	WorkerR2PutOptions,
	"onlyIf" | "httpMetadata"
> & {
	onlyIf?: WorkerR2Conditional | Headers;
	httpMetadata?: WorkerR2HTTPMetadata | Headers;
};
export type R2MultipartOptions = Omit<
	WorkerR2MultipartOptions,
	"httpMetadata"
> & {
	httpMetadata?: WorkerR2HTTPMetadata | Headers;
};
export type R2MultipartUpload = Omit<
	WorkerR2MultipartUpload,
	"uploadPart" | "complete"
> & {
	uploadPart(
		partNumber: number,
		value: ReadableStream | (ArrayBuffer | ArrayBufferView) | string | Blob
	): Promise<WorkerR2UploadedPart>;
	complete(uploadedParts: WorkerR2UploadedPart[]): Promise<R2Object>;
};
export type R2Objects = {
	objects: R2Object[];
	delimitedPrefixes: string[];
} & ({ truncated: true; cursor: string } | { truncated: false });

export type R2Bucket = Omit<
	WorkerR2Bucket,
	| "head"
	| "get"
	| "put"
	| "createMultipartUpload"
	| "resumeMultipartUpload"
	| "list"
> & {
	head(key: string): Promise<R2Object | null>;
	get(
		key: string,
		options: R2GetOptions & {
			onlyIf: WorkerR2Conditional | Headers;
		}
	): Promise<R2ObjectBody | R2Object | null>;
	get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
	put(
		key: string,
		value:
			| ReadableStream
			| ArrayBuffer
			| ArrayBufferView
			| string
			| null
			| Blob,
		options?: R2PutOptions
	): Promise<R2Object>;
	put(
		key: string,
		value:
			| ReadableStream
			| ArrayBuffer
			| ArrayBufferView
			| string
			| null
			| Blob,
		options?: R2PutOptions & {
			onlyIf: WorkerR2Conditional | Headers;
		}
	): Promise<R2Object | null>;
	createMultipartUpload(
		key: string,
		options?: R2MultipartOptions
	): Promise<R2MultipartUpload>;
	resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload;
	list(options?: WorkerR2ListOptions): Promise<R2Objects>;
};
