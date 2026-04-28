import { fetchListResult, fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import type {
	AiSearchInstance,
	AiSearchMessage,
	AiSearchNamespace,
	AiSearchSearchResponse,
	AiSearchStats,
	AiSearchToken,
} from "./types";
import type { Config } from "@cloudflare/workers-utils";

const jsonContentType = "application/json; charset=utf-8;";

/** Default namespace used when the caller does not specify one. */
export const DEFAULT_NAMESPACE = "default";

function baseNamespaceUrl(accountId: string): string {
	return `/accounts/${accountId}/ai-search/namespaces`;
}

function baseInstanceUrl(accountId: string, namespace: string): string {
	return `${baseNamespaceUrl(accountId)}/${namespace}/instances`;
}

function baseTokenUrl(accountId: string): string {
	return `/accounts/${accountId}/ai-search/tokens`;
}

// ── Instances ──────────────────────────────────────────────────────────────────

export async function listInstances(
	config: Config,
	namespace: string,
	queryParams?: URLSearchParams
): Promise<AiSearchInstance[]> {
	const accountId = await requireAuth(config);
	return await fetchResult<AiSearchInstance[]>(
		config,
		baseInstanceUrl(accountId, namespace),
		{ method: "GET" },
		queryParams
	);
}

export async function createInstance(
	config: Config,
	accountId: string,
	namespace: string,
	body: Record<string, unknown>
): Promise<AiSearchInstance> {
	return await fetchResult<AiSearchInstance>(
		config,
		baseInstanceUrl(accountId, namespace),
		{
			method: "POST",
			headers: { "content-type": jsonContentType },
			body: JSON.stringify(body),
		}
	);
}

export async function getInstance(
	config: Config,
	namespace: string,
	name: string
): Promise<AiSearchInstance> {
	const accountId = await requireAuth(config);
	return await fetchResult<AiSearchInstance>(
		config,
		`${baseInstanceUrl(accountId, namespace)}/${name}`,
		{ method: "GET" }
	);
}

export async function updateInstance(
	config: Config,
	namespace: string,
	name: string,
	body: Record<string, unknown>
): Promise<AiSearchInstance> {
	const accountId = await requireAuth(config);
	return await fetchResult<AiSearchInstance>(
		config,
		`${baseInstanceUrl(accountId, namespace)}/${name}`,
		{
			method: "PUT",
			headers: { "content-type": jsonContentType },
			body: JSON.stringify(body),
		}
	);
}

export async function deleteInstance(
	config: Config,
	namespace: string,
	name: string
): Promise<AiSearchInstance> {
	const accountId = await requireAuth(config);
	return await fetchResult<AiSearchInstance>(
		config,
		`${baseInstanceUrl(accountId, namespace)}/${name}`,
		{ method: "DELETE" }
	);
}

export async function getInstanceStats(
	config: Config,
	namespace: string,
	name: string
): Promise<AiSearchStats> {
	const accountId = await requireAuth(config);
	return await fetchResult<AiSearchStats>(
		config,
		`${baseInstanceUrl(accountId, namespace)}/${name}/stats`,
		{ method: "GET" }
	);
}

export async function searchInstance(
	config: Config,
	namespace: string,
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
		`${baseInstanceUrl(accountId, namespace)}/${name}/search`,
		{
			method: "POST",
			headers: { "content-type": jsonContentType },
			body: JSON.stringify(body),
		}
	);
}

// ── Namespaces ─────────────────────────────────────────────────────────────────

export async function listNamespaces(
	config: Config,
	queryParams?: URLSearchParams
): Promise<AiSearchNamespace[]> {
	const accountId = await requireAuth(config);
	return await fetchResult<AiSearchNamespace[]>(
		config,
		baseNamespaceUrl(accountId),
		{ method: "GET" },
		queryParams
	);
}

export async function createNamespace(
	config: Config,
	accountId: string,
	body: { name: string; description?: string }
): Promise<AiSearchNamespace> {
	return await fetchResult<AiSearchNamespace>(
		config,
		baseNamespaceUrl(accountId),
		{
			method: "POST",
			headers: { "content-type": jsonContentType },
			body: JSON.stringify(body),
		}
	);
}

export async function getNamespace(
	config: Config,
	name: string
): Promise<AiSearchNamespace> {
	const accountId = await requireAuth(config);
	return await fetchResult<AiSearchNamespace>(
		config,
		`${baseNamespaceUrl(accountId)}/${name}`,
		{ method: "GET" }
	);
}

export async function updateNamespace(
	config: Config,
	name: string,
	body: { description?: string }
): Promise<AiSearchNamespace> {
	const accountId = await requireAuth(config);
	return await fetchResult<AiSearchNamespace>(
		config,
		`${baseNamespaceUrl(accountId)}/${name}`,
		{
			method: "PUT",
			headers: { "content-type": jsonContentType },
			body: JSON.stringify(body),
		}
	);
}

export async function deleteNamespace(
	config: Config,
	name: string
): Promise<void> {
	const accountId = await requireAuth(config);
	await fetchResult<unknown>(config, `${baseNamespaceUrl(accountId)}/${name}`, {
		method: "DELETE",
	});
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
