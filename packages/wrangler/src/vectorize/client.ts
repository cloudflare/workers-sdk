import { fetchListResult, fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import type {
	VectorFloatArray,
	VectorizeAsyncMutation,
	VectorizeIndex,
	VectorizeIndexDetails,
	VectorizeListVectorsResponse,
	VectorizeMatches,
	VectorizeMetadataIndexList,
	VectorizeMetadataIndexProperty,
	VectorizeMetadataIndexPropertyName,
	VectorizeQueryOptions,
	VectorizeVector,
	VectorizeVectorIds,
	VectorizeVectorMutation,
} from "./types";
import type { Config } from "@cloudflare/workers-utils";
import type { FormData } from "undici";

const jsonContentType = "application/json; charset=utf-8;";

export async function createIndex(
	config: Config,
	body: object,
	deprecatedV1: boolean
): Promise<VectorizeIndex> {
	const accountId = await requireAuth(config);
	const versionParam = deprecatedV1 ? `` : `/v2`;

	return await fetchResult<VectorizeIndex>(
		config,
		`/accounts/${accountId}/vectorize${versionParam}/indexes`,
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
	indexName: string,
	deprecatedV1: boolean
): Promise<void> {
	const accountId = await requireAuth(config);
	const versionParam = deprecatedV1 ? `` : `/v2`;
	return await fetchResult<void>(
		config,
		`/accounts/${accountId}/vectorize${versionParam}/indexes/${indexName}`,
		{
			method: "DELETE",
		}
	);
}

export async function getIndex(
	config: Config,
	indexName: string,
	deprecatedV1: boolean
): Promise<VectorizeIndex> {
	const accountId = await requireAuth(config);
	const versionParam = deprecatedV1 ? `` : `/v2`;
	return await fetchResult(
		config,
		`/accounts/${accountId}/vectorize${versionParam}/indexes/${indexName}`,
		{
			method: "GET",
		}
	);
}

export async function listIndexes(
	config: Config,
	deprecatedV1: boolean
): Promise<VectorizeIndex[]> {
	const accountId = await requireAuth(config);
	const versionParam = deprecatedV1 ? `` : `/v2`;
	return await fetchListResult<VectorizeIndex>(
		config,
		`/accounts/${accountId}/vectorize${versionParam}/indexes`,
		{
			method: "GET",
		}
	);
}

export async function insertIntoIndexV1(
	config: Config,
	indexName: string,
	body: FormData
): Promise<VectorizeVectorMutation> {
	const accountId = await requireAuth(config);

	return await fetchResult(
		config,
		`/accounts/${accountId}/vectorize/indexes/${indexName}/insert`,
		{
			method: "POST",
			body: body,
		}
	);
}

export async function insertIntoIndex(
	config: Config,
	indexName: string,
	body: FormData
): Promise<VectorizeAsyncMutation> {
	const accountId = await requireAuth(config);

	return await fetchResult(
		config,
		`/accounts/${accountId}/vectorize/v2/indexes/${indexName}/insert`,
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
): Promise<VectorizeAsyncMutation> {
	const accountId = await requireAuth(config);

	return await fetchResult(
		config,
		`/accounts/${accountId}/vectorize/v2/indexes/${indexName}/upsert`,
		{
			method: "POST",
			body: body,
		}
	);
}

export async function queryIndexByVector(
	config: Config,
	indexName: string,
	vector: VectorFloatArray | number[],
	options: VectorizeQueryOptions
): Promise<VectorizeMatches> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/vectorize/v2/indexes/${indexName}/query`,
		{
			method: "POST",
			headers: {
				"content-type": jsonContentType,
			},
			body: JSON.stringify({
				...options,
				vector: Array.isArray(vector) ? vector : Array.from(vector),
			}),
		}
	);
}

export async function queryIndexByVectorId(
	config: Config,
	indexName: string,
	vectorId: string,
	options: VectorizeQueryOptions
): Promise<VectorizeMatches> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/vectorize/v2/indexes/${indexName}/query`,
		{
			method: "POST",
			headers: {
				"content-type": jsonContentType,
			},
			body: JSON.stringify({
				...options,
				vectorId,
			}),
		}
	);
}

export async function getByIds(
	config: Config,
	indexName: string,
	ids: VectorizeVectorIds
): Promise<VectorizeVector[]> {
	const accountId = await requireAuth(config);

	return await fetchResult(
		config,
		`/accounts/${accountId}/vectorize/v2/indexes/${indexName}/get_by_ids`,
		{
			method: "POST",
			headers: {
				"content-type": jsonContentType,
			},
			body: JSON.stringify(ids),
		}
	);
}

export async function deleteByIds(
	config: Config,
	indexName: string,
	ids: VectorizeVectorIds
): Promise<VectorizeAsyncMutation> {
	const accountId = await requireAuth(config);

	return await fetchResult(
		config,
		`/accounts/${accountId}/vectorize/v2/indexes/${indexName}/delete_by_ids`,
		{
			method: "POST",
			headers: {
				"content-type": jsonContentType,
			},
			body: JSON.stringify(ids),
		}
	);
}

export async function indexInfo(
	config: Config,
	indexName: string
): Promise<VectorizeIndexDetails> {
	const accountId = await requireAuth(config);

	return await fetchResult(
		config,
		`/accounts/${accountId}/vectorize/v2/indexes/${indexName}/info`,
		{
			method: "GET",
		}
	);
}

export async function createMetadataIndex(
	config: Config,
	indexName: string,
	payload: VectorizeMetadataIndexProperty
): Promise<VectorizeAsyncMutation> {
	const accountId = await requireAuth(config);

	return await fetchResult(
		config,
		`/accounts/${accountId}/vectorize/v2/indexes/${indexName}/metadata_index/create`,
		{
			method: "POST",
			headers: {
				"content-type": jsonContentType,
			},
			body: JSON.stringify(payload),
		}
	);
}

export async function listMetadataIndex(
	config: Config,
	indexName: string
): Promise<VectorizeMetadataIndexList> {
	const accountId = await requireAuth(config);

	return await fetchResult(
		config,
		`/accounts/${accountId}/vectorize/v2/indexes/${indexName}/metadata_index/list`,
		{
			method: "GET",
		}
	);
}

export async function deleteMetadataIndex(
	config: Config,
	indexName: string,
	payload: VectorizeMetadataIndexPropertyName
): Promise<VectorizeAsyncMutation> {
	const accountId = await requireAuth(config);

	return await fetchResult(
		config,
		`/accounts/${accountId}/vectorize/v2/indexes/${indexName}/metadata_index/delete`,
		{
			method: "POST",
			headers: {
				"content-type": jsonContentType,
			},
			body: JSON.stringify(payload),
		}
	);
}

export async function listVectors(
	config: Config,
	indexName: string,
	options?: {
		count?: number;
		cursor?: string;
	}
): Promise<VectorizeListVectorsResponse> {
	const accountId = await requireAuth(config);

	const searchParams = new URLSearchParams();
	if (options?.count !== undefined) {
		searchParams.set("count", options.count.toString());
	}
	if (options?.cursor !== undefined) {
		searchParams.set("cursor", options.cursor);
	}

	const queryString = searchParams.toString();
	const url = `/accounts/${accountId}/vectorize/v2/indexes/${indexName}/list${
		queryString ? `?${queryString}` : ""
	}`;

	return await fetchResult(config, url, {
		method: "GET",
	});
}
