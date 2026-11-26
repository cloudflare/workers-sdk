import { URLSearchParams } from "node:url";
import { fetchResult } from "../cfetch";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

// Keep these types aligned with the K2 OpenAPI contract.
export type K2HttpInput =
	| { enabled: false }
	| { enabled: true; authentication?: boolean; cors?: { origins?: string[] } };

export interface CreateK2Stream {
	name: string;
	retention_seconds?: number;
	http: K2HttpInput;
	worker_binding: { enabled: boolean };
}

export interface K2Stream extends CreateK2Stream {
	id: string;
	retention_seconds: number;
	endpoint?: string;
	created_at: string;
	modified_at: string;
}

/** Creates a stream. `fetchResult` does not retry, so an ambiguous failure never creates a second stream. */
export async function createK2Stream(
	config: ComplianceConfig,
	accountId: string,
	input: CreateK2Stream
): Promise<K2Stream> {
	return await fetchResult<K2Stream>(
		config,
		`/accounts/${accountId}/k2/streams`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		}
	);
}

/** Reads one account-owned K2 stream by its public ID. */
export async function getK2Stream(
	config: ComplianceConfig,
	accountId: string,
	streamId: string
): Promise<K2Stream> {
	return await fetchResult<K2Stream>(
		config,
		`/accounts/${accountId}/k2/streams/${encodeURIComponent(streamId)}`
	);
}

/** Deletes an account-owned K2 stream by its public ID. */
export async function deleteK2Stream(
	config: ComplianceConfig,
	accountId: string,
	streamId: string
): Promise<void> {
	await fetchResult<void>(
		config,
		`/accounts/${accountId}/k2/streams/${encodeURIComponent(streamId)}`,
		{ method: "DELETE" }
	);
}

/** Lists one page of streams, with an optional case-insensitive name filter. */
export async function listK2Streams(
	config: ComplianceConfig,
	accountId: string,
	query: { page: number; per_page: number; name?: string }
): Promise<K2Stream[]> {
	const params = new URLSearchParams({
		page: String(query.page),
		per_page: String(query.per_page),
	});
	if (query.name !== undefined) {
		params.set("name", query.name);
	}
	return await fetchResult<K2Stream[]>(
		config,
		`/accounts/${accountId}/k2/streams`,
		{},
		params
	);
}
