import { fetchListResult, fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import type { Config } from "../config";
import type {
	VectorizeDistanceMetric,
	VectorizeIndex,
	VectorizeIndexDetails,
	VectorizeQueryOptions,
	VectorizeVector,
	VectorizeVectorMutation,
} from "@cloudflare/workers-types";
import type { FormData } from "undici";

const jsonContentType = "application/json; charset=utf-8;";

interface VectorizeIndexResult extends VectorizeIndexDetails {
	readonly created_on: string;
	readonly modified_on: string;
	readonly config: IndexConfigResult;
}

interface IndexConfigResult {
	metric: VectorizeDistanceMetric;
	dimensions: number;
}

export async function createIndex(
	config: Config,
	body: object
): Promise<VectorizeIndexResult> {
	const accountId = await requireAuth(config);

	return await fetchResult<VectorizeIndexResult>(
		`/accounts/${accountId}/vectorize/indexes`,
		{
			method: "POST",
			headers: {
				"content-type": jsonContentType,
			},
			body: JSON.stringify(body),
		}
	);
}

export async function deleteIndex(
	config: Config,
	indexName: string
): Promise<void> {
	const accountId = await requireAuth(config);
	return await fetchResult<void>(
		`/accounts/${accountId}/vectorize/indexes/${indexName}`,
		{
			method: "DELETE",
		}
	);
}

export async function getIndex(
	config: Config,
	indexName: string
): Promise<VectorizeIndexResult> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		`/accounts/${accountId}/vectorize/indexes/${indexName}`,
		{
			method: "GET",
		}
	);
}

export async function listIndexes(
	config: Config
): Promise<VectorizeIndexResult[]> {
	const accountId = await requireAuth(config);
	return await fetchListResult<VectorizeIndexResult>(
		`/accounts/${accountId}/vectorize/indexes`,
		{
			method: "GET",
		}
	);
}

export async function updateIndex(
	config: Config,
	indexName: string,
	body: VectorizeIndex
): Promise<VectorizeIndexResult> {
	const accountId = await requireAuth(config);
	return await fetchResult<VectorizeIndexResult>(
		`/accounts/${accountId}/vectorize/indexes/${indexName}`,
		{
			method: "PUT",
			body: JSON.stringify(body),
		}
	);
}

export async function insertIntoIndex(
	config: Config,
	indexName: string,
	body: FormData
): Promise<VectorizeVectorMutation> {
	const accountId = await requireAuth(config);

	return await fetchResult(
		`/accounts/${accountId}/vectorize/indexes/${indexName}/insert`,
		{
			method: "POST",
			body: body,
		}
	);
}

export async function upsertIntoIndex(
	config: Config,
	indexName: string,
	body: FormData
): Promise<VectorizeVectorMutation> {
	const accountId = await requireAuth(config);

	return await fetchResult(
		`/accounts/${accountId}/vectorize/indexes/${indexName}/upsert`,
		{
			method: "POST",
			body: body,
		}
	);
}

export async function queryIndex(
	config: Config,
	indexName: string,
	query: VectorizeVector,
	options?: VectorizeQueryOptions
): Promise<VectorizeIndex> {
	const accountId = await requireAuth(config);

	const payload = {
		query: query,
		options: options,
	};

	return await fetchResult(
		`/accounts/${accountId}/vectorize/indexes/${indexName}/query`,
		{
			method: "POST",
			body: JSON.stringify(payload),
		}
	);
}

export async function getByIds(
	config: Config,
	indexName: string,
	ids: Array<string>
): Promise<VectorizeIndex> {
	const accountId = await requireAuth(config);

	return await fetchResult(
		`/accounts/${accountId}/vectorize/indexes/${indexName}/getByIds`,
		{
			method: "POST",
			body: JSON.stringify(ids),
		}
	);
}

export async function deleteByIds(
	config: Config,
	indexName: string,
	ids: Array<string>
): Promise<VectorizeIndex> {
	const accountId = await requireAuth(config);

	return await fetchResult(
		`/accounts/${accountId}/vectorize/indexes/${indexName}/deleteIds`,
		{
			method: "POST",
			body: JSON.stringify(ids),
		}
	);
}
