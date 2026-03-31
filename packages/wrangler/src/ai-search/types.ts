/**
 * Represents an AI Search instance.
 */
export interface AiSearchInstance {
	id: string;
	created_at: string;
	modified_at: string;
	source: string;
	type: "r2" | "web-crawler";
	vectorize_name?: string;
	ai_gateway_id?: string;
	ai_search_model?: string;
	cache?: boolean;
	cache_threshold?: string;
	chunk_overlap?: number;
	chunk_size?: number;
	created_by?: string;
	custom_metadata?: AiSearchCustomMetadata[];
	embedding_model?: string;
	enable?: boolean;
	fusion_method?: string;
	hybrid_search_enabled?: boolean;
	last_activity?: string;
	max_num_results?: number;
	metadata?: {
		created_from_aisearch_wizard?: boolean;
		worker_domain?: string;
	};
	modified_by?: string;
	paused?: boolean;
	public_endpoint_id?: string;
	public_endpoint_params?: AiSearchPublicEndpointParams;
	reranking?: boolean;
	reranking_model?: string;
	retrieval_options?: {
		keyword_match_mode?: string;
	};
	rewrite_model?: string;
	rewrite_query?: boolean;
	score_threshold?: number;
	source_params?: AiSearchSourceParams;
	status?: string;
	token_id?: string;
}

export interface AiSearchCustomMetadata {
	data_type: string;
	field_name: string;
}

export interface AiSearchPublicEndpointParams {
	authorized_hosts?: string[];
	chat_completions_endpoint?: { disabled?: boolean };
	enabled?: boolean;
	mcp?: { description?: string; disabled?: boolean };
	rate_limit?: { period_ms?: number; requests?: number; technique?: string };
	search_endpoint?: { disabled?: boolean };
}

export interface AiSearchSourceParams {
	exclude_items?: string[];
	include_items?: string[];
	prefix?: string;
	r2_jurisdiction?: string;
	web_crawler?: {
		parse_options?: {
			include_headers?: Record<string, string>;
			include_images?: boolean;
			specific_sitemaps?: string[];
			use_browser_rendering?: boolean;
		};
		parse_type?: string;
		store_options?: {
			storage_id?: string;
			r2_jurisdiction?: string;
			storage_type?: string;
		};
	};
}

/**
 * Stats for an AI Search instance.
 */
export interface AiSearchStats {
	/** Items queued but not yet started. */
	queued: number;
	/** Items actively being processed. */
	running: number;
	/** Items successfully indexed. */
	completed: number;
	/** Items skipped during indexing. */
	skipped: number;
	/** Items that are outdated and need re-indexing. */
	outdated: number;
	/** Items that errored during indexing. */
	error: number;
}

/**
 * A chunk returned from a search.
 */
export interface AiSearchChunk {
	id: string;
	score: number;
	text: string;
	type: string;
	item?: {
		key: string;
		metadata?: Record<string, unknown>;
		timestamp?: number;
	};
	scoring_details?: {
		keyword_rank?: number;
		keyword_score?: number;
		reranking_score?: number;
		vector_rank?: number;
		vector_score?: number;
	};
}

/**
 * Response from a search query.
 */
export interface AiSearchSearchResponse {
	chunks: AiSearchChunk[];
	search_query: string;
}

/**
 * An AI Search API token.
 */
export interface AiSearchToken {
	id: string;
	cf_api_id?: string;
	created_at: string;
	expires_at?: string;
	modified_at: string;
	name: string;
	status: string;
	value?: string;
}

/**
 * Messages for search.
 */
export interface AiSearchMessage {
	role: "system" | "user" | "assistant";
	content: string;
}
