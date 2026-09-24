import { throwFetchError } from "@cloudflare/workers-utils";
import { createCloudflareClient } from "../../shared/context";
import type { ComplianceConfig, FetchResult } from "@cloudflare/workers-utils";
import type { Worker } from "cloudflare/resources/workers/beta/workers/workers";

/**
 * Fetches a Worker via the Workers "Get Worker" endpoint.
 *
 * The returned `id` is the Worker's immutable ID, which is the same value as
 * the legacy script tag.
 *
 * Cloudflare SDK API errors are translated into Wrangler's `APIError` so that
 * callers can handle them the same way as errors from `fetchResult()`, e.g.
 * with `isWorkerNotFoundError()`.
 *
 * @param complianceConfig The compliance region configuration
 * @param accountId The account that owns the Worker
 * @param workerName The Worker's name or ID
 * @returns The Worker
 */
export async function fetchWorker(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string
): Promise<Worker> {
	try {
		return await createCloudflareClient(
			complianceConfig
		).workers.beta.workers.get(workerName, { account_id: accountId });
	} catch (e) {
		if (isSDKAPIError(e)) {
			throwFetchError(
				`/accounts/${accountId}/workers/workers/${workerName}`,
				{ success: false, errors: e.errors, messages: [], result: null },
				e.status
			);
		}
		throw e;
	}
}

/**
 * The parts of the Cloudflare SDK's `APIError` needed to translate it.
 *
 * Checked structurally because the SDK client may come from a different
 * bundled copy of the `cloudflare` package. Connection errors have no
 * `status`, so they are not matched.
 */
interface SDKAPIError {
	status: number;
	errors: FetchResult["errors"];
}

function isSDKAPIError(e: unknown): e is SDKAPIError {
	return (
		typeof e === "object" &&
		e !== null &&
		"status" in e &&
		typeof e.status === "number" &&
		"errors" in e &&
		Array.isArray(e.errors)
	);
}
