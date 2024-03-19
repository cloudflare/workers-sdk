import { Miniflare } from "miniflare";
import { fetchResult } from "../cfetch";
import { fetchR2Objects } from "../cfetch/internal";
import { getLocalPersistencePath } from "../dev/get-local-persistence-path";
import { buildPersistOptions } from "../dev/miniflare";
import { UserError } from "../errors";
import { logger } from "../logger";
import type { ApiCredentials } from "../user";
import type { R2Bucket } from "@cloudflare/workers-types/experimental";
import type { ReplaceWorkersTypes } from "miniflare";
import type { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import type { HeadersInit } from "undici";

/**
 * Information about a bucket, returned from `listR2Buckets()`.
 */
export interface R2BucketInfo {
	name: string;
	creation_date: string;
}

/**
 * Fetch a list of all the buckets under the given `accountId`.
 */
export async function listR2Buckets(
	accountId: string,
	jurisdiction?: string
): Promise<R2BucketInfo[]> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	const results = await fetchResult<{
		buckets: R2BucketInfo[];
	}>(`/accounts/${accountId}/r2/buckets`, { headers });
	return results.buckets;
}

/**
 * Create a bucket with the given `bucketName` within the account given by `accountId`.
 *
 * A 400 is returned if the account already owns a bucket with this name.
 * A bucket must be explicitly deleted to be replaced.
 */
export async function createR2Bucket(
	accountId: string,
	bucketName: string,
	jurisdiction?: string
): Promise<void> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	return await fetchResult<void>(`/accounts/${accountId}/r2/buckets`, {
		method: "POST",
		body: JSON.stringify({ name: bucketName }),
		headers,
	});
}

/**
 * Delete a bucket with the given name
 */
export async function deleteR2Bucket(
	accountId: string,
	bucketName: string,
	jurisdiction?: string
): Promise<void> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	return await fetchResult<void>(
		`/accounts/${accountId}/r2/buckets/${bucketName}`,
		{ method: "DELETE", headers }
	);
}

export function bucketAndKeyFromObjectPath(objectPath = ""): {
	bucket: string;
	key: string;
} {
	const match = /^([^/]+)\/(.*)/.exec(objectPath);
	if (match === null) {
		throw new UserError(
			`The object path must be in the form of {bucket}/{key} you provided ${objectPath}`
		);
	}

	return { bucket: match[1], key: match[2] };
}

/**
 * Downloads an object
 */
export async function getR2Object(
	accountId: string,
	bucketName: string,
	objectName: string,
	jurisdiction?: string
): Promise<ReadableStream | null> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	const response = await fetchR2Objects(
		`/accounts/${accountId}/r2/buckets/${bucketName}/objects/${objectName}`,
		{
			method: "GET",
			headers,
		}
	);

	return response === null ? null : response.body;
}

/**
 * Uploads an object
 */
export async function putR2Object(
	accountId: string,
	bucketName: string,
	objectName: string,
	object: Readable | ReadableStream | Buffer,
	options: Record<string, unknown>,
	jurisdiction?: string
): Promise<void> {
	const headerKeys = [
		"content-length",
		"content-type",
		"content-disposition",
		"content-encoding",
		"content-language",
		"cache-control",
		"expires",
	];
	const headers: HeadersInit = {};
	for (const key of headerKeys) {
		const value = options[key] || "";
		if (value && typeof value === "string") headers[key] = value;
	}
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	const result = await fetchR2Objects(
		`/accounts/${accountId}/r2/buckets/${bucketName}/objects/${objectName}`,
		{
			body: object,
			headers,
			method: "PUT",
			duplex: "half",
		}
	);
	if (result === null) {
		throw new UserError("The specified bucket does not exist.");
	}
}
/**
 * Delete an Object
 */
export async function deleteR2Object(
	accountId: string,
	bucketName: string,
	objectName: string,
	jurisdiction?: string
): Promise<void> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	await fetchR2Objects(
		`/accounts/${accountId}/r2/buckets/${bucketName}/objects/${objectName}`,
		{ method: "DELETE", headers }
	);
}

export async function usingLocalBucket<T>(
	persistTo: string | undefined,
	configPath: string | undefined,
	bucketName: string,
	closure: (
		namespace: ReplaceWorkersTypes<R2Bucket>,
		mf: Miniflare
	) => Promise<T>
): Promise<T> {
	const persist = getLocalPersistencePath(persistTo, configPath);
	const persistOptions = buildPersistOptions(persist);
	const mf = new Miniflare({
		modules: true,
		// TODO(soon): import `reduceError()` from `miniflare:shared`
		script: `
		function reduceError(e) {
			return {
				name: e?.name,
				message: e?.message ?? String(e),
				stack: e?.stack,
				cause: e?.cause === undefined ? undefined : reduceError(e.cause),
			};
		}
		export default {
			async fetch(request, env, ctx) {
				try {
					if (request.method !== "PUT") return new Response(null, { status: 405 });
					const url = new URL(request.url);
					const key = url.pathname.substring(1);
					const optsHeader = request.headers.get("Wrangler-R2-Put-Options");
					const opts = JSON.parse(optsHeader);
					await env.BUCKET.put(key, request.body, opts);
					return new Response(null, { status: 204 });
				} catch (e) {
					const error = reduceError(e);
					return Response.json(error, {
						status: 500,
						headers: { "MF-Experimental-Error-Stack": "true" },
					});
				}
			}
		}`,
		...persistOptions,
		r2Buckets: { BUCKET: bucketName },
	});
	const bucket = await mf.getR2Bucket("BUCKET");
	try {
		return await closure(bucket, mf);
	} finally {
		await mf.dispose();
	}
}

type SippyConfig = {
	source:
		| { provider: "aws"; region: string; bucket: string }
		| { provider: "gcs"; bucket: string };
	destination: {
		provider: "r2";
		account: string;
		bucket: string;
		accessKeyId: string;
	};
};

/**
 * Retreive the sippy upstream bucket for the bucket with the given name
 */
export async function getR2Sippy(
	accountId: string,
	bucketName: string,
	jurisdiction?: string
): Promise<SippyConfig> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	return await fetchResult(
		`/accounts/${accountId}/r2/buckets/${bucketName}/sippy`,
		{ method: "GET", headers }
	);
}

/**
 * Disable sippy on the bucket with the given name
 */
export async function deleteR2Sippy(
	accountId: string,
	bucketName: string,
	jurisdiction?: string
): Promise<void> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	return await fetchResult(
		`/accounts/${accountId}/r2/buckets/${bucketName}/sippy`,
		{ method: "DELETE", headers }
	);
}

export type SippyPutParams = {
	source:
		| {
				provider: "aws";
				region: string;
				bucket: string;
				accessKeyId: string;
				secretAccessKey: string;
		  }
		| {
				provider: "gcs";
				bucket: string;
				clientEmail: string;
				privateKey: string;
		  };
	destination: {
		provider: "r2";
		accessKeyId: string;
		secretAccessKey: string;
	};
};

/**
 * Enable sippy on the bucket with the given name
 */
export async function putR2Sippy(
	accountId: string,
	bucketName: string,
	params: SippyPutParams,
	jurisdiction?: string
): Promise<void> {
	const headers: HeadersInit = {
		"Content-Type": "application/json",
	};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	return await fetchResult(
		`/accounts/${accountId}/r2/buckets/${bucketName}/sippy`,
		{ method: "PUT", body: JSON.stringify(params), headers }
	);
}

export const R2EventableOperations = [
	"PutObject",
	"DeleteObject",
	"CompleteMultipartUpload",
	"AbortMultipartUpload",
	"CopyObject",
	"LifecycleDeletion",
] as const;
export type R2EventableOperation = typeof R2EventableOperations[number];
// This type captures the shape of the data expected by EWC API.
export type EWCRequestBody = {
	bucketName: string;
	queue: string;
	// `jurisdiction` is included here for completeness, but until Queues
	// supports jurisdictions, then this command will not send anything to do
	// with jurisdictions.
	jurisdiction?: string;
	rules: Array<{
		prefix?: string;
		suffix?: string;
		actions: R2EventableOperation[];
	}>;
};

function eventNotificationHeaders(apiCredentials: ApiCredentials): HeadersInit {
	const headers: HeadersInit = {
		"Content-Type": "application/json",
	};

	if ("apiToken" in apiCredentials) {
		headers["Authorization"] = `Bearer ${apiCredentials.apiToken}`;
	} else {
		headers["X-Auth-Key"] = apiCredentials.authKey;
		headers["X-Auth-Email"] = apiCredentials.authEmail;
	}
	return headers;
}
/** Construct & transmit notification configuration to EWC.
 *
 * On success, receive HTTP 200 response with a body like:
 * { event_notification_detail_id: string }
 *
 * Possible status codes on failure:
 * - 400 Bad Request - Either:
 * 		- Uploaded configuration is invalid
 * 		- Communication with either R2-gateway-worker or queue-broker-worker fails
 * - 409 Conflict - A configuration between the bucket and queue already exists
 * */
export async function putEventNotificationConfig(
	apiCredentials: ApiCredentials,
	accountId: string,
	bucketName: string,
	queueUUID: string,
	actions: R2EventableOperation[],
	prefix?: string,
	suffix?: string
): Promise<{ event_notification_detail_id: string }> {
	const headers = eventNotificationHeaders(apiCredentials);
	const body: EWCRequestBody = {
		bucketName,
		queue: queueUUID,
		rules: [{ prefix, suffix, actions }],
	};
	logger.log(
		`Sending this configuration to "${bucketName}":\n${JSON.stringify(body)}`
	);
	return await fetchResult<{ event_notification_detail_id: string }>(
		`/accounts/${accountId}/event_notifications/r2/${bucketName}/configuration/queues/${queueUUID}`,
		{ method: "PUT", body: JSON.stringify(body), headers }
	);
}

export async function deleteEventNotificationConfig(
	apiCredentials: ApiCredentials,
	accountId: string,
	bucketName: string,
	queueUUID: string
): Promise<null> {
	const headers = eventNotificationHeaders(apiCredentials);
	logger.log(
		`Disabling event notifications for "${bucketName}" to queue ${queueUUID}...`
	);
	return await fetchResult<null>(
		`/accounts/${accountId}/event_notifications/r2/${bucketName}/configuration/queues/${queueUUID}`,
		{ method: "DELETE", headers }
	);
}
