/**
 * A single Web Search result returned by the REST API.
 *
 * Web Search is discovery-only -- results carry catalog metadata about a page
 * but never the page body. To read a result's content, fetch the URL yourself.
 *
 * Field names mirror the public REST API (snake_case). The Worker binding
 * (`env.WEBSEARCH.search()`) exposes the same data with camelCase keys.
 */
export interface WebSearchResult {
	/** Canonical URL. */
	url: string;
	/** Page title. */
	title: string;
	/** Page-level description. May be absent. */
	description?: string;
	/**
	 * Last-modified date for the page, when known. ISO-8601 datetime,
	 * e.g. "2026-04-23T00:00:00.000Z".
	 */
	last_modified_date?: string;
	/** Page meta image URL (typically og:image). May be absent. */
	image_url?: string;
	/** Optional favicon URL for UI hints. */
	favicon_url?: string;
}

/**
 * Per-response metadata for a Web Search query. Carries operational fields
 * useful for support and debugging.
 */
export interface WebSearchResponseMetadata {
	/** The query that was executed. */
	query: string;
	/** Opaque request identifier used for support and debugging. */
	request_id: string;
	/** End-to-end latency for this search request, in milliseconds. */
	latency_ms: number;
}

/**
 * Response from a Web Search query.
 */
export interface WebSearchSearchResponse {
	items: WebSearchResult[];
	metadata: WebSearchResponseMetadata;
}
