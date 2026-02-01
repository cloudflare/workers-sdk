/**
 * Data types supported for holding vector metadata.
 */
export type VectorizeVectorMetadataValue = string | number | boolean | string[];

// /**
//  * Data types supported for holding vector metadata as strings.
//  */
export type VectorizeVectorMetadataValueString =
	| "string"
	| "number"
	| "boolean";

/**
 * Additional information to associate with a vector.
 */
type VectorizeVectorMetadata =
	| VectorizeVectorMetadataValue
	| Record<string, VectorizeVectorMetadataValue>;

export type VectorFloatArray = Float32Array | Float64Array;

/**
 * Comparison logic/operation to use for metadata filtering.
 *
 * This list is expected to grow as support for more operations are released.
 */
export type VectorizeMetadataFilterEqualityOp = "$eq" | "$ne";
export type VectorizeMetadataFilterSetOp = "$in" | "$nin";
export type VectorizeMetadataFilterRangeOp = "$lt" | "$lte" | "$gt" | "$gte";

export type VectorizeVectorMetadataFilterOp =
	| VectorizeMetadataFilterEqualityOp
	| VectorizeMetadataFilterSetOp
	| VectorizeMetadataFilterRangeOp;

export type VectorizeMetadataFilterInnerValue = Record<
	VectorizeVectorMetadataFilterOp,
	| Exclude<VectorizeVectorMetadataValue, string[]>
	| Exclude<VectorizeVectorMetadataValue, string[]>[]
>;

export type VectorizeMetadataFilterValue =
	| Exclude<VectorizeVectorMetadataValue, string[]>
	| null
	| VectorizeMetadataFilterInnerValue;

/**
 * Filter criteria for vector metadata used to limit the retrieved query result set.
 */
export type VectorizeVectorMetadataFilter = {
	[field: string]: VectorizeMetadataFilterValue;
};

/**
 * Supported distance metrics for an index.
 * Distance metrics determine how other "similar" vectors are determined.
 */
export type VectorizeDistanceMetric = "euclidean" | "cosine" | "dot-product";

/**
 * Metadata return levels for a Vectorize query.
 *
 * Default to "none".
 *
 * @property all      Full metadata for the vector return set, including all fields (including those un-indexed) without truncation. This is a more expensive retrieval, as it requires additional fetching & reading of un-indexed data.
 * @property indexed  Return all metadata fields configured for indexing in the vector return set. This level of retrieval is "free" in that no additional overhead is incurred returning this data. However, note that indexed metadata is subject to truncation (especially for larger strings).
 * @property none     No indexed metadata will be returned.
 */
export type VectorizeMetadataRetrievalLevel = "all" | "indexed" | "none";

export interface VectorizeQueryOptions {
	topK?: number;
	namespace?: string;
	returnValues?: boolean;
	returnMetadata?: VectorizeMetadataRetrievalLevel;
	filter?: VectorizeVectorMetadataFilter;
}

/**
 * Information about the configuration of an index.
 */
type VectorizeIndexConfig = {
	dimensions: number;
	metric: VectorizeDistanceMetric;
};

/**
 * Metadata about an existing index.
 */
export interface VectorizeIndex {
	/** The name of the index. */
	name: string;
	/** (optional) A human readable description for the index. */
	description?: string;
	/** Specifies the timestamp the index was created as an ISO8601 string. */
	readonly created_on: string;
	/** Specifies the timestamp the index was modified as an ISO8601 string. */
	readonly modified_on: string;
	/** Configuration properties for the created index. */
	readonly config: VectorizeIndexConfig;
}

/**
 * Represents a single vector value set along with its associated metadata.
 */
export interface VectorizeVector {
	/** The ID for the vector. This can be user-defined, and must be unique. It should uniquely identify the object, and is best set based on the ID of what the vector represents. */
	id: string;
	/** The vector values */
	values: VectorFloatArray | number[];
	/** The namespace this vector belongs to. */
	namespace?: string;
	/** Metadata associated with the vector. Includes the values of other fields and potentially additional details. */
	metadata?: Record<string, VectorizeVectorMetadata>;
}

/**
 * Represents a matched vector for a query along with its score and (if specified) the matching vector information.
 */
type VectorizeMatch = Pick<Partial<VectorizeVector>, "values"> &
	Omit<VectorizeVector, "values"> & {
		/** The score or rank for similarity, when returned as a result */
		score: number;
	};

/**
 * A set of matching {@link VectorizeMatch} for a particular query.
 */
export interface VectorizeMatches {
	matches: VectorizeMatch[];
	count: number;
}

/**
 * Results of an operation that performed a mutation on a set of vectors.
 * Here, `ids` is a list of vectors that were successfully processed.
 *
 * This type is exclusively for the Vectorize **beta** and will be deprecated once Vectorize RC is released.
 * See {@link VectorizeAsyncMutation} for its post-beta equivalent.
 */
export interface VectorizeVectorMutation {
	/* List of ids of vectors that were successfully processed. */
	ids: string[];
	/* Total count of the number of processed vectors. */
	count: number;
}

/**
 * Request type used to pass vector ids to fetch or delete.
 */
export interface VectorizeVectorIds {
	/* List of vector ids that are fetched or deleted. */
	ids: string[];
}

/**
 * Result type indicating a mutation on the Vectorize Index.
 * Actual mutations are processed async where the `mutationId` is the unique identifier for the operation.
 */
export interface VectorizeAsyncMutation {
	/** The unique identifier for the async mutation operation containing the changeset. */
	mutationId: string;
}

export type VectorizeIndexDetails = {
	/** Specifies the dimensions value for the index. */
	dimensions: number;
	/** Specifies the number of vectors in the index. */
	vectorCount: number;
	/** Specifies the timestamp the last mutation batch was processed. */
	processedUpToDatetime: string;
	/** Identifier for the last mutation batch processed. */
	processedUpToMutation: string;
};

export interface VectorizeMetadataIndexProperty
	extends VectorizeMetadataIndexPropertyName {
	/** Specifies the type of metadata property to index. */
	indexType: VectorizeVectorMetadataValueString;
}

export type VectorizeMetadataIndexList = {
	metadataIndexes: VectorizeMetadataIndexProperty[];
};

export interface VectorizeMetadataIndexPropertyName {
	/** Indexed metadata property. */
	propertyName: string;
}

/**
 * Represents a single vector item in a list response.
 */
export interface VectorizeListVectorItem {
	/** The ID of the vector. */
	id: string;
}

/**
 * Response from listing vectors in an index.
 */
export interface VectorizeListVectorsResponse {
	/** Number of vectors returned in this response */
	count: number;
	/** Total number of vectors in the index */
	totalCount: number;
	/** Whether there are more vectors available beyond this response */
	isTruncated: boolean;
	/** Cursor for the next page of results */
	nextCursor?: string;
	/** When the cursor expires as an ISO8601 string */
	cursorExpirationTimestamp?: string;
	/** Array of vector items */
	vectors: VectorizeListVectorItem[];
}
