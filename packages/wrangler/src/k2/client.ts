import { UserError } from "@cloudflare/workers-utils";
import type Cloudflare from "cloudflare";

// K2 management resources are not generated in the Cloudflare SDK yet. Keep
// this adapter aligned with the K2 OpenAPI contract until they are published.
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

interface ApiResponse<T> {
	success: boolean;
	result: T;
}

async function resultOf<T>(request: PromiseLike<ApiResponse<T>>): Promise<T> {
	const response = await request;
	if (
		response?.success !== true ||
		response.result === undefined ||
		response.result === null
	) {
		throw new UserError("The K2 API did not return a successful result.", {
			telemetryMessage: "k2 streams invalid api response",
		});
	}
	return response.result;
}

/** Creates a stream using Wrangler's authenticated, environment-aware SDK client. */
export async function createK2Stream(
	sdk: Cloudflare,
	accountId: string,
	input: CreateK2Stream
): Promise<K2Stream> {
	return resultOf(
		sdk.post<CreateK2Stream, ApiResponse<K2Stream>>(
			`/accounts/${accountId}/k2/streams`,
			{
				body: input,
				// A transport failure can leave a created stream behind. Do not create
				// another one automatically when the outcome of the first call is unknown.
				maxRetries: 0,
			}
		)
	);
}

/** Reads one account-owned K2 stream by its public ID. */
export async function getK2Stream(
	sdk: Cloudflare,
	accountId: string,
	streamId: string
): Promise<K2Stream> {
	return resultOf(
		sdk.get<unknown, ApiResponse<K2Stream>>(
			`/accounts/${accountId}/k2/streams/${encodeURIComponent(streamId)}`
		)
	);
}

/** Deletes an account-owned K2 stream by its public ID. */
export async function deleteK2Stream(
	sdk: Cloudflare,
	accountId: string,
	streamId: string
): Promise<void> {
	await resultOf(
		sdk.delete<unknown, ApiResponse<Record<string, never>>>(
			`/accounts/${accountId}/k2/streams/${encodeURIComponent(streamId)}`,
			{ maxRetries: 0 }
		)
	);
}

/** Lists one page of streams, with an optional case-insensitive name filter. */
export async function listK2Streams(
	sdk: Cloudflare,
	accountId: string,
	query: { page: number; per_page: number; name?: string }
): Promise<K2Stream[]> {
	return resultOf(
		sdk.get<unknown, ApiResponse<K2Stream[]>>(
			`/accounts/${accountId}/k2/streams`,
			{ query }
		)
	);
}
