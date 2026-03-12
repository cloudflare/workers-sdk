import { APIError } from "@cloudflare/workers-utils";
import { fetchListResult, fetchResult, performApiFetch } from "../cfetch";
import { requireAuth } from "../user";
import type {
	AiSearchChatCompletionResponse,
	AiSearchInstance,
	AiSearchItem,
	AiSearchItemChunk,
	AiSearchItemLog,
	AiSearchJob,
	AiSearchJobLog,
	AiSearchMessage,
	AiSearchSearchResponse,
	AiSearchStats,
	AiSearchToken,
} from "./types";
import type { Config } from "@cloudflare/workers-utils";

const jsonContentType = "application/json; charset=utf-8;";

function baseInstanceUrl(accountId: string): string {
	return `/accounts/${accountId}/ai-search/instances`;
}

function baseTokenUrl(accountId: string): string {
	return `/accounts/${accountId}/ai-search/tokens`;
}

// ── Instances ──────────────────────────────────────────────────────────────────

export async function listInstances(
	config: Config,
	queryParams?: URLSearchParams
): Promise<AiSearchInstance[]> {
	const accountId = await requireAuth(config);
	return await fetchListResult<AiSearchInstance>(
		config,
		baseInstanceUrl(accountId),
		{ method: "GET" },
		queryParams
	);
}

export async function createInstance(
	config: Config,
	body: object
): Promise<AiSearchInstance> {
	const accountId = await requireAuth(config);
	return await fetchResult<AiSearchInstance>(
		config,
		baseInstanceUrl(accountId),
		{
			method: "POST",
			headers: { "content-type": jsonContentType },
			body: JSON.stringify(body),
		}
	);
}

export async function getInstance(
	config: Config,
	name: string
): Promise<AiSearchInstance> {
	const accountId = await requireAuth(config);
	return await fetchResult<AiSearchInstance>(
		config,
		`${baseInstanceUrl(accountId)}/${name}`,
		{ method: "GET" }
	);
}

export async function updateInstance(
	config: Config,
	name: string,
	body: object
): Promise<AiSearchInstance> {
	const accountId = await requireAuth(config);
	return await fetchResult<AiSearchInstance>(
		config,
		`${baseInstanceUrl(accountId)}/${name}`,
		{
			method: "PUT",
			headers: { "content-type": jsonContentType },
			body: JSON.stringify(body),
		}
	);
}

export async function deleteInstance(
	config: Config,
	name: string
): Promise<AiSearchInstance> {
	const accountId = await requireAuth(config);
	return await fetchResult<AiSearchInstance>(
		config,
		`${baseInstanceUrl(accountId)}/${name}`,
		{ method: "DELETE" }
	);
}

export async function getInstanceStats(
	config: Config,
	name: string
): Promise<AiSearchStats> {
	const accountId = await requireAuth(config);
	return await fetchResult<AiSearchStats>(
		config,
		`${baseInstanceUrl(accountId)}/${name}/stats`,
		{ method: "GET" }
	);
}

export async function searchInstance(
	config: Config,
	name: string,
	body: {
		messages: AiSearchMessage[];
		filters?: Record<string, string>;
		max_num_results?: number;
		score_threshold?: number;
		reranking?: boolean;
	}
): Promise<AiSearchSearchResponse> {
	const accountId = await requireAuth(config);
	return await fetchResult<AiSearchSearchResponse>(
		config,
		`${baseInstanceUrl(accountId)}/${name}/search`,
		{
			method: "POST",
			headers: { "content-type": jsonContentType },
			body: JSON.stringify(body),
		}
	);
}

export async function chatCompletions(
	config: Config,
	name: string,
	body: {
		messages: AiSearchMessage[];
		model?: string;
		filters?: Record<string, string>;
	}
): Promise<AiSearchChatCompletionResponse> {
	const accountId = await requireAuth(config);
	const resource = `${baseInstanceUrl(accountId)}/${name}/chat/completions`;

	// The chat/completions endpoint returns an OpenAI-style response directly,
	// not wrapped in the standard Cloudflare V4 API envelope. We use
	// performApiFetch instead of fetchResult to avoid envelope unwrapping.
	const response = await performApiFetch(config, resource, {
		method: "POST",
		headers: { "content-type": jsonContentType },
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new APIError({
			text: `A request to the Cloudflare API (${resource}) failed.`,
			notes: [{ text: errorText }],
			status: response.status,
		});
	}

	return (await response.json()) as AiSearchChatCompletionResponse;
}

// ── Items ──────────────────────────────────────────────────────────────────────

export async function listItems(
	config: Config,
	name: string,
	queryParams?: URLSearchParams
): Promise<AiSearchItem[]> {
	const accountId = await requireAuth(config);
	return await fetchListResult<AiSearchItem>(
		config,
		`${baseInstanceUrl(accountId)}/${name}/items`,
		{ method: "GET" },
		queryParams
	);
}

export async function getItem(
	config: Config,
	name: string,
	itemId: string
): Promise<AiSearchItem> {
	const accountId = await requireAuth(config);
	return await fetchResult<AiSearchItem>(
		config,
		`${baseInstanceUrl(accountId)}/${name}/items/${itemId}`,
		{ method: "GET" }
	);
}

export async function getItemLogs(
	config: Config,
	name: string,
	itemId: string,
	queryParams?: URLSearchParams
): Promise<AiSearchItemLog[]> {
	const accountId = await requireAuth(config);
	return await fetchResult<AiSearchItemLog[]>(
		config,
		`${baseInstanceUrl(accountId)}/${name}/items/${itemId}/logs`,
		{ method: "GET" },
		queryParams
	);
}

export async function listItemChunks(
	config: Config,
	name: string,
	itemId: string,
	queryParams?: URLSearchParams
): Promise<AiSearchItemChunk[]> {
	const accountId = await requireAuth(config);
	return await fetchListResult<AiSearchItemChunk>(
		config,
		`${baseInstanceUrl(accountId)}/${name}/items/${itemId}/chunks`,
		{ method: "GET" },
		queryParams
	);
}

// ── Jobs ───────────────────────────────────────────────────────────────────────

export async function listJobs(
	config: Config,
	name: string
): Promise<AiSearchJob[]> {
	const accountId = await requireAuth(config);
	return await fetchListResult<AiSearchJob>(
		config,
		`${baseInstanceUrl(accountId)}/${name}/jobs`,
		{ method: "GET" }
	);
}

export async function createJob(
	config: Config,
	name: string
): Promise<AiSearchJob> {
	const accountId = await requireAuth(config);
	return await fetchResult<AiSearchJob>(
		config,
		`${baseInstanceUrl(accountId)}/${name}/jobs`,
		{
			method: "POST",
			headers: { "content-type": jsonContentType },
			body: JSON.stringify({}),
		}
	);
}

export async function getJob(
	config: Config,
	name: string,
	jobId: string
): Promise<AiSearchJob> {
	const accountId = await requireAuth(config);
	return await fetchResult<AiSearchJob>(
		config,
		`${baseInstanceUrl(accountId)}/${name}/jobs/${jobId}`,
		{ method: "GET" }
	);
}

export async function getJobLogs(
	config: Config,
	name: string,
	jobId: string
): Promise<AiSearchJobLog[]> {
	const accountId = await requireAuth(config);
	return await fetchResult<AiSearchJobLog[]>(
		config,
		`${baseInstanceUrl(accountId)}/${name}/jobs/${jobId}/logs`,
		{ method: "GET" }
	);
}

// ── Tokens ─────────────────────────────────────────────────────────────────────

export async function listTokens(config: Config): Promise<AiSearchToken[]> {
	const accountId = await requireAuth(config);
	return await fetchListResult<AiSearchToken>(config, baseTokenUrl(accountId), {
		method: "GET",
	});
}
