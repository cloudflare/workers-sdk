import { fetchListResult, fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import type {
	AiSearchInstance,
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
	return await fetchResult<AiSearchInstance[]>(
		config,
		baseInstanceUrl(accountId),
		{ method: "GET" },
		queryParams
	);
}

export async function createInstance(
	config: Config,
	accountId: string,
	body: Record<string, unknown>
): Promise<AiSearchInstance> {
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
	body: Record<string, unknown>
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

// ── Tokens ─────────────────────────────────────────────────────────────────────

export async function listTokens(
	config: Config,
	accountId: string
): Promise<AiSearchToken[]> {
	return await fetchListResult<AiSearchToken>(config, baseTokenUrl(accountId), {
		method: "GET",
	});
}
