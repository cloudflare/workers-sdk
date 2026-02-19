export type PipelineTable = {
	id: string;
	version: number;
	latest: number;
	type: "stream" | "sink";
	name: string;
	href: string;
};

export interface Pipeline {
	id: string;
	name: string;
	created_at: string;
	modified_at: string;
	sql: string;
	status: string;
	tables?: PipelineTable[];
}

export interface PaginationInfo {
	count: number;
	page: number;
	per_page: number;
	total_count: number;
}

export interface CloudflareAPIResponse<T> {
	success: boolean;
	errors: string[];
	messages: string[];
	result: T;
}

export interface PipelineListResponse
	extends CloudflareAPIResponse<Pipeline[]> {
	result_info: PaginationInfo;
}

export interface CreatePipelineRequest {
	name: string;
	sql: string;
}

export interface ValidateSqlRequest {
	sql: string;
}

export type ValidateSqlResponse = CloudflareAPIResponse<{
	graph?: {
		nodes: Array<{
			node_id: number;
			operator: string;
			description: string;
			parallelism: number;
		}>;
		edges: Array<{
			src_id: number;
			dest_id: number;
			key_type: string;
			value_type: string;
			edge_type: string;
		}>;
	};
	tables: Record<
		string,
		{
			id: string;
			version: number;
			type: string;
			name: string;
		}
	>;
}>;

export interface ListPipelinesParams {
	page?: number;
	per_page?: number;
}

export interface Stream {
	id: string;
	name: string;
	version: number;
	created_at: string;
	modified_at: string;
	endpoint: string;
	format: StreamJsonFormat;
	schema: {
		fields: SchemaField[];
	} | null;
	http: {
		enabled: boolean;
		authentication: boolean;
		cors?: {
			origins: string[];
		};
	};
	worker_binding: {
		enabled: boolean;
	};
}

export interface StreamListResponse extends CloudflareAPIResponse<Stream[]> {
	result_info: PaginationInfo;
}

export interface ListStreamsParams {
	page?: number;
	per_page?: number;
	pipeline_id?: string;
}

// Stream Format type (only JSON supported)
export type StreamJsonFormat = {
	type: "json";
	timestamp_format?: "rfc3339" | "unix_millis";
	unstructured?: boolean;
};

// Format types
export type JsonFormat = {
	type: "json";
};

export type ParquetFormat = {
	type: "parquet";
	compression?: "uncompressed" | "snappy" | "gzip" | "zstd" | "lz4";
	row_group_bytes?: number;
};

export type SinkFormat = JsonFormat | ParquetFormat;

// Schema types
export type SchemaField = {
	name: string;
	type:
		| "bool"
		| "int32"
		| "int64"
		| "uint32"
		| "uint64"
		| "float32"
		| "float64"
		| "decimal128"
		| "string"
		| "timestamp"
		| "json"
		| "bytes"
		| "list"
		| "struct";
	required: boolean;
	fields?: SchemaField[];
	items?: SchemaField;
	unit?: "second" | "millisecond" | "microsecond" | "nanosecond"; // For timestamp type
	precision?: number; // For decimal128 type
	scale?: number; // For decimal128 type
};

export type Sink = {
	id: string;
	name: string;
	created_at?: string;
	modified_at?: string;
	version?: number;
	type: "r2" | "r2_data_catalog";
	format: SinkFormat;
	schema: {
		fields: SchemaField[];
	} | null;
	config: {
		bucket: string;
		path?: string;
		partitioning?: {
			time_pattern: string;
		};
		rolling_policy?: {
			file_size_bytes?: number;
			interval_seconds: number;
		};
		// r2_data_catalog specific fields
		account_id?: string;
		token?: string;
		namespace?: string;
		table_name?: string;
	};
	used_by?: Array<{
		href: string;
	}>;
};

export interface SinkListResponse extends CloudflareAPIResponse<Sink[]> {
	result_info: PaginationInfo;
}

export interface ListSinksParams {
	page?: number;
	per_page?: number;
	pipeline_id?: string;
}

export interface CreateSinkRequest {
	name: string;
	type: "r2" | "r2_data_catalog";
	format?: SinkFormat;
	schema?: {
		fields: SchemaField[];
	};
	config: {
		bucket: string;
		path?: string;
		partitioning?: {
			time_pattern: string;
		};
		rolling_policy?: {
			file_size_bytes?: number;
			interval_seconds: number;
		};
		// R2 credentials (for r2 type)
		credentials?: {
			access_key_id: string;
			secret_access_key: string;
		};
		// R2 Data Catalog specific fields
		namespace?: string;
		table_name?: string;
		token?: string;
	};
}

export interface CreateStreamRequest {
	name: string;
	format?: StreamJsonFormat;
	schema?: {
		fields: SchemaField[];
	};
	http: {
		enabled: boolean;
		authentication: boolean;
		cors?: {
			origins: string[];
		};
	};
	worker_binding: {
		enabled: boolean;
	};
}
