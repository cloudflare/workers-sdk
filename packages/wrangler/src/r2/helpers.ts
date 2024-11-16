import { Miniflare } from "miniflare";
import prettyBytes from "pretty-bytes";
import { fetchGraphqlResult, fetchResult } from "../cfetch";
import { fetchR2Objects } from "../cfetch/internal";
import { getLocalPersistencePath } from "../dev/get-local-persistence-path";
import { buildPersistOptions } from "../dev/miniflare";
import { UserError } from "../errors";
import { logger } from "../logger";
import { getQueue, getQueueById } from "../queues/client";
import type { Config } from "../config";
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
	location?: string;
	storage_class?: string;
}

export interface R2BucketMetrics {
	max?: {
		objectCount?: number;
		payloadSize?: number;
		metadataSize?: number;
	};
	dimensions: {
		datetime?: string;
	};
}

export interface R2BucketMetricsGraphQLResponse {
	data: {
		viewer: {
			accounts: {
				r2StorageAdaptiveGroups?: R2BucketMetrics[];
			}[];
		};
	};
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

export function tablefromR2BucketsListResponse(buckets: R2BucketInfo[]): {
	name: string;
	creation_date: string;
}[] {
	const rows = [];
	for (const bucket of buckets) {
		rows.push({
			name: bucket.name,
			creation_date: bucket.creation_date,
		});
	}
	return rows;
}

export async function getR2Bucket(
	accountId: string,
	bucketName: string,
	jurisdiction?: string
): Promise<R2BucketInfo> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	const result = await fetchResult<R2BucketInfo>(
		`/accounts/${accountId}/r2/buckets/${bucketName}`,
		{
			method: "GET",
			headers,
		}
	);
	return result;
}

export async function getR2BucketMetrics(
	accountId: string,
	bucketName: string,
	jurisdiction?: string
): Promise<{ objectCount: number; totalSize: string }> {
	const today = new Date();
	const yesterday = new Date(new Date(today).setDate(today.getDate() - 1));

	let fullBucketName = bucketName;
	if (jurisdiction) {
		fullBucketName = `${jurisdiction}_${bucketName}`;
	}

	const storageMetricsQuery = `
    query getR2StorageMetrics($accountTag: String, $filter: R2StorageAdaptiveGroupsFilter_InputObject) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          r2StorageAdaptiveGroups(
            limit: 1
            filter: $filter
            orderBy: [datetime_DESC]
          ) {
            max {
              objectCount
              payloadSize
              metadataSize
            }
            dimensions {
              datetime
            }
          }
        }
      }
    }
    `;

	const variables = {
		accountTag: accountId,
		filter: {
			datetime_geq: yesterday.toISOString(),
			datetime_leq: today.toISOString(),
			bucketName: fullBucketName,
		},
	};
	const storageMetricsResult =
		await fetchGraphqlResult<R2BucketMetricsGraphQLResponse>({
			method: "POST",
			body: JSON.stringify({
				query: storageMetricsQuery,
				operationName: "getR2StorageMetrics",
				variables,
			}),
			headers: {
				"Content-Type": "application/json",
			},
		});

	if (storageMetricsResult) {
		const metricsData =
			storageMetricsResult.data?.viewer?.accounts[0]
				?.r2StorageAdaptiveGroups?.[0];
		if (metricsData && metricsData.max) {
			const objectCount = metricsData.max.objectCount || 0;
			const totalSize =
				(metricsData.max.payloadSize || 0) +
				(metricsData.max.metadataSize || 0);
			return {
				objectCount,
				totalSize: prettyBytes(totalSize),
			};
		}
	}
	return { objectCount: 0, totalSize: "0 B" };
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
	location?: string,
	jurisdiction?: string,
	storageClass?: string
): Promise<void> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	return await fetchResult<void>(`/accounts/${accountId}/r2/buckets`, {
		method: "POST",
		body: JSON.stringify({
			name: bucketName,
			...(storageClass !== undefined && { storageClass }),
			...(location !== undefined && { locationHint: location }),
		}),
		headers,
	});
}

/**
 * Update the default storage class to `storageClass` of a bucket with the given `bucketName`
 * within the account given by `accountId`.
 */
export async function updateR2BucketStorageClass(
	accountId: string,
	bucketName: string,
	storageClass: string,
	jurisdiction?: string
): Promise<void> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	headers["cf-r2-storage-class"] = storageClass;
	return await fetchResult<void>(
		`/accounts/${accountId}/r2/buckets/${bucketName}`,
		{
			method: "PATCH",
			headers,
		}
	);
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
	jurisdiction?: string,
	storageClass?: string
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
		if (value && typeof value === "string") {
			headers[key] = value;
		}
	}
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	if (storageClass !== undefined) {
		headers["cf-r2-storage-class"] = storageClass;
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

const R2EventableOperations = [
	"PutObject",
	"DeleteObject",
	"CompleteMultipartUpload",
	"AbortMultipartUpload",
	"CopyObject",
	"LifecycleDeletion",
] as const;
export type R2EventableOperation = (typeof R2EventableOperations)[number];

export const actionsForEventCategories: Record<
	"object-create" | "object-delete",
	R2EventableOperation[]
> = {
	"object-create": ["PutObject", "CompleteMultipartUpload", "CopyObject"],
	"object-delete": ["DeleteObject", "LifecycleDeletion"],
};
export type R2EventType = keyof typeof actionsForEventCategories;
type NotificationRule = {
	prefix?: string;
	suffix?: string;
	actions: R2EventableOperation[];
	description?: string;
};
type GetNotificationRule = {
	ruleId: string;
	createdAt?: string;
	prefix?: string;
	suffix?: string;
	actions: R2EventableOperation[];
};
export type GetQueueDetail = {
	queueId: string;
	queueName: string;
	rules: GetNotificationRule[];
};
export type GetNotificationConfigResponse = {
	bucketName: string;
	queues: GetQueueDetail[];
};
type DetailID = string;
type QueueID = string;
type BucketName = string;
type NotificationDetail = Record<
	DetailID, // This is the detail ID that identifies this config
	{ queue: QueueID; rules: NotificationRule[] }
>;
// Event Notifications API Backwards Compatibility
export type GetNotificationConfigResponseOld = Record<
	BucketName,
	NotificationDetail
>;
// This type captures the shape of the data expected by EWC API.
export type PutNotificationRequestBody = {
	// `jurisdiction` is included here for completeness, but until Queues
	// supports jurisdictions, then this command will not send anything to do
	// with jurisdictions.
	jurisdiction?: string;
	rules: NotificationRule[];
};

// This type captures the shape of the data expected by EWC API.
export type DeleteNotificationRequestBody = {
	ruleIds?: string[];
};

export function eventNotificationHeaders(
	apiCredentials: ApiCredentials,
	jurisdiction: string
): HeadersInit {
	const headers: HeadersInit = {
		"Content-Type": "application/json",
	};

	if ("apiToken" in apiCredentials) {
		headers["Authorization"] = `Bearer ${apiCredentials.apiToken}`;
	} else {
		headers["X-Auth-Key"] = apiCredentials.authKey;
		headers["X-Auth-Email"] = apiCredentials.authEmail;
	}
	if (jurisdiction !== "") {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	return headers;
}

export function tableFromNotificationGetResponse(
	response: GetNotificationConfigResponse
): {
	rule_id: string;
	created_at: string;
	queue_name: string;
	prefix: string;
	suffix: string;
	event_type: string;
}[] {
	const rows = [];
	for (const entry of response.queues) {
		for (const {
			prefix = "",
			suffix = "",
			actions,
			ruleId,
			createdAt = "",
		} of entry.rules) {
			rows.push({
				rule_id: ruleId,
				created_at: createdAt,
				queue_name: entry.queueName,
				prefix: prefix || "(all prefixes)",
				suffix: suffix || "(all suffixes)",
				event_type: actions.join(","),
			});
		}
	}
	return rows;
}

export async function listEventNotificationConfig(
	apiCredentials: ApiCredentials,
	accountId: string,
	bucketName: string,
	jurisdiction: string
): Promise<GetNotificationConfigResponse> {
	const headers = eventNotificationHeaders(apiCredentials, jurisdiction);
	logger.log(`Fetching notification rules for bucket ${bucketName}...`);
	const res = await fetchResult<GetNotificationConfigResponse>(
		`/accounts/${accountId}/event_notifications/r2/${bucketName}/configuration`,
		{ method: "GET", headers }
	);
	if ("bucketName" in res && "queues" in res) {
		return res;
	}
	// API response doesn't match new format. Trying the old format.
	// Convert the old style payload to the new
	// We can assume that the old payload has a single bucket entry
	const oldResult = res as GetNotificationConfigResponseOld;
	const [oldBucketName, oldDetail] = Object.entries(oldResult)[0];
	const newResult: GetNotificationConfigResponse = {
		bucketName: oldBucketName,
		queues: await Promise.all(
			Object.values(oldDetail).map(async (oldQueue) => {
				const newQueue: GetQueueDetail = {
					queueId: oldQueue.queue,
					queueName: (await getQueueById(accountId, oldQueue.queue)).queue_name,
					rules: oldQueue.rules.map((oldRule) => {
						const newRule: GetNotificationRule = {
							ruleId: "",
							prefix: oldRule.prefix,
							suffix: oldRule.suffix,
							actions: oldRule.actions,
						};
						return newRule;
					}),
				};
				return newQueue;
			})
		),
	};
	return newResult;
}

/** Construct & transmit notification configuration to EWC.
 *
 * On success, receive HTTP 200 response with no body
 *
 * Possible status codes on failure:
 * - 400 Bad Request - Either:
 * 		- Uploaded configuration is invalid
 * 		- Communication with either R2-gateway-worker or queue-broker-worker fails
 * - 409 Conflict - A configuration between the bucket and queue already exists
 * */
export async function putEventNotificationConfig(
	config: Config,
	apiCredentials: ApiCredentials,
	accountId: string,
	bucketName: string,
	jurisdiction: string,
	queueName: string,
	eventTypes: R2EventType[],
	prefix?: string,
	suffix?: string,
	description?: string
): Promise<void> {
	const queue = await getQueue(config, queueName);
	const headers = eventNotificationHeaders(apiCredentials, jurisdiction);
	let actions: R2EventableOperation[] = [];

	for (const et of eventTypes) {
		actions = actions.concat(actionsForEventCategories[et]);
	}

	const body: PutNotificationRequestBody =
		description === undefined
			? {
					rules: [{ prefix, suffix, actions }],
				}
			: {
					rules: [{ prefix, suffix, actions, description }],
				};
	const ruleFor = eventTypes.map((et) =>
		et === "object-create" ? "creation" : "deletion"
	);
	logger.log(
		`Creating event notification rule for object ${ruleFor.join(
			" and "
		)} (${actions.join(",")})`
	);
	return await fetchResult<void>(
		`/accounts/${accountId}/event_notifications/r2/${bucketName}/configuration/queues/${queue.queue_id}`,
		{ method: "PUT", body: JSON.stringify(body), headers }
	);
}

export async function deleteEventNotificationConfig(
	config: Config,
	apiCredentials: ApiCredentials,
	accountId: string,
	bucketName: string,
	jurisdiction: string,
	queueName: string,
	ruleId: string | undefined
): Promise<null> {
	const queue = await getQueue(config, queueName);
	const headers = eventNotificationHeaders(apiCredentials, jurisdiction);
	if (ruleId !== undefined) {
		logger.log(`Deleting event notifications rule "${ruleId}"...`);
		const body: DeleteNotificationRequestBody =
			ruleId !== undefined
				? {
						ruleIds: [ruleId],
					}
				: {};

		return await fetchResult<null>(
			`/accounts/${accountId}/event_notifications/r2/${bucketName}/configuration/queues/${queue.queue_id}`,
			{ method: "DELETE", body: JSON.stringify(body), headers }
		);
	} else {
		logger.log(
			`Deleting event notification rules associated with queue ${queueName}...`
		);
		return await fetchResult<null>(
			`/accounts/${accountId}/event_notifications/r2/${bucketName}/configuration/queues/${queue.queue_id}`,
			{ method: "DELETE", headers }
		);
	}
}

export interface CustomDomainConfig {
	domain: string;
	minTLS?: string;
	zoneId?: string;
}

export interface CustomDomainInfo {
	domain: string;
	enabled: boolean;
	status: {
		ownership: string;
		ssl: string;
	};
	minTLS: string;
	zoneId: string;
	zoneName: string;
}

export async function attachCustomDomainToBucket(
	accountId: string,
	bucketName: string,
	config: CustomDomainConfig,
	jurisdiction?: string
): Promise<void> {
	const headers: HeadersInit = {
		"Content-Type": "application/json",
	};
	if (jurisdiction) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	await fetchResult(
		`/accounts/${accountId}/r2/buckets/${bucketName}/domains/custom`,
		{
			method: "POST",
			headers,
			body: JSON.stringify({
				...config,
				enabled: true,
			}),
		}
	);
}

export async function removeCustomDomainFromBucket(
	accountId: string,
	bucketName: string,
	domainName: string,
	jurisdiction?: string
): Promise<void> {
	const headers: HeadersInit = {};
	if (jurisdiction) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	await fetchResult(
		`/accounts/${accountId}/r2/buckets/${bucketName}/domains/custom/${domainName}`,
		{
			method: "DELETE",
			headers,
		}
	);
}

export function tableFromCustomDomainListResponse(
	domains: CustomDomainInfo[]
): {
	domain: string;
	enabled: string;
	ownership_status: string;
	ssl_status: string;
	min_tls_version: string;
	zone_id: string;
	zone_name: string;
}[] {
	const rows = [];
	for (const domainInfo of domains) {
		rows.push({
			domain: domainInfo.domain,
			enabled: domainInfo.enabled ? "Yes" : "No",
			ownership_status: domainInfo.status.ownership || "(unknown)",
			ssl_status: domainInfo.status.ssl || "(unknown)",
			min_tls_version: domainInfo.minTLS || "1.0",
			zone_id: domainInfo.zoneId || "(none)",
			zone_name: domainInfo.zoneName || "(none)",
		});
	}
	return rows;
}

export async function listCustomDomainsOfBucket(
	accountId: string,
	bucketName: string,
	jurisdiction?: string
): Promise<CustomDomainInfo[]> {
	const headers: HeadersInit = {};
	if (jurisdiction) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	const result = await fetchResult<{
		domains: CustomDomainInfo[];
	}>(`/accounts/${accountId}/r2/buckets/${bucketName}/domains/custom`, {
		method: "GET",
		headers,
	});

	return result.domains;
}

export async function configureCustomDomainSettings(
	accountId: string,
	bucketName: string,
	domainName: string,
	config: CustomDomainConfig,
	jurisdiction?: string
): Promise<void> {
	const headers: HeadersInit = {
		"Content-Type": "application/json",
	};
	if (jurisdiction) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	await fetchResult(
		`/accounts/${accountId}/r2/buckets/${bucketName}/domains/custom/${domainName}`,
		{
			method: "PUT",
			headers,
			body: JSON.stringify(config),
		}
	);
}

export interface R2DevDomainInfo {
	bucketId: string;
	domain: string;
	enabled: boolean;
}

export async function getR2DevDomain(
	accountId: string,
	bucketName: string,
	jurisdiction?: string
): Promise<R2DevDomainInfo> {
	const headers: HeadersInit = {};
	if (jurisdiction) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	const result = await fetchResult<R2DevDomainInfo>(
		`/accounts/${accountId}/r2/buckets/${bucketName}/domains/managed`,
		{
			method: "GET",
			headers,
		}
	);
	return result;
}

export async function updateR2DevDomain(
	accountId: string,
	bucketName: string,
	enabled: boolean,
	jurisdiction?: string
): Promise<R2DevDomainInfo> {
	const headers: HeadersInit = {
		"Content-Type": "application/json",
	};
	if (jurisdiction) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	const result = await fetchResult<R2DevDomainInfo>(
		`/accounts/${accountId}/r2/buckets/${bucketName}/domains/managed`,
		{
			method: "PUT",
			headers,
			body: JSON.stringify({ enabled }),
		}
	);
	return result;
}

export interface LifecycleCondition {
	type: "Age" | "Date";
	maxAge?: number;
	date?: string;
}

export interface LifecycleRule {
	id: string;
	enabled: boolean;
	conditions: {
		prefix?: string;
	};
	deleteObjectsTransition?: {
		condition: LifecycleCondition;
	};
	storageClassTransitions?: Array<{
		condition: LifecycleCondition;
		storageClass: "InfrequentAccess";
	}>;
	abortMultipartUploadsTransition?: {
		condition: LifecycleCondition;
	};
}

function formatCondition(condition: LifecycleCondition): string {
	if (condition.type === "Age" && typeof condition.maxAge === "number") {
		const days = condition.maxAge / 86400; // Convert seconds to days
		return `after ${days} days`;
	} else if (condition.type === "Date" && condition.date) {
		const date = new Date(condition.date);
		const displayDate = date.toISOString().split("T")[0];
		return `on ${displayDate}`;
	}

	return "";
}

export function tableFromLifecycleRulesResponse(rules: LifecycleRule[]): {
	id: string;
	enabled: string;
	prefix: string;
	action: string;
}[] {
	const rows = [];
	for (const rule of rules) {
		const actions = [];

		if (rule.deleteObjectsTransition) {
			const action = "Expire objects";
			const condition = formatCondition(rule.deleteObjectsTransition.condition);
			actions.push(`${action} ${condition}`);
		}
		if (
			rule.storageClassTransitions &&
			rule.storageClassTransitions.length > 0
		) {
			for (const transition of rule.storageClassTransitions) {
				const action = "Transition to Infrequent Access";
				const condition = formatCondition(transition.condition);
				actions.push(`${action} ${condition}`);
			}
		}
		if (rule.abortMultipartUploadsTransition) {
			const action = "Abort incomplete multipart uploads";
			const condition = formatCondition(
				rule.abortMultipartUploadsTransition.condition
			);
			actions.push(`${action} ${condition}`);
		}

		rows.push({
			id: rule.id,
			enabled: rule.enabled ? "Yes" : "No",
			prefix: rule.conditions.prefix || "(all prefixes)",
			action: actions.join(", ") || "(none)",
		});
	}
	return rows;
}

export async function getLifecycleRules(
	accountId: string,
	bucket: string,
	jurisdiction?: string
): Promise<LifecycleRule[]> {
	const headers: HeadersInit = {};
	if (jurisdiction) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	const result = await fetchResult<{ rules: LifecycleRule[] }>(
		`/accounts/${accountId}/r2/buckets/${bucket}/lifecycle`,
		{
			method: "GET",
			headers,
		}
	);
	return result.rules;
}

export async function putLifecycleRules(
	accountId: string,
	bucket: string,
	rules: LifecycleRule[],
	jurisdiction?: string
): Promise<void> {
	const headers: HeadersInit = {
		"Content-Type": "application/json",
	};
	if (jurisdiction) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	await fetchResult(`/accounts/${accountId}/r2/buckets/${bucket}/lifecycle`, {
		method: "PUT",
		headers,
		body: JSON.stringify({ rules: rules }),
	});
}

export function formatActionDescription(action: string): string {
	switch (action) {
		case "expire":
			return "expire objects";
		case "transition":
			return "transition to Infrequent Access storage class";
		case "abort-multipart":
			return "abort incomplete multipart uploads";
		default:
			return action;
	}
}

export function isValidDate(dateString: string): boolean {
	const regex = /^\d{4}-\d{2}-\d{2}$/;
	if (!regex.test(dateString)) {
		return false;
	}
	const date = new Date(`${dateString}T00:00:00.000Z`);
	const timestamp = date.getTime();
	if (isNaN(timestamp)) {
		return false;
	}
	const [year, month, day] = dateString.split("-").map(Number);
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() + 1 === month &&
		date.getUTCDate() === day
	);
}

export function isNonNegativeNumber(str: string): boolean {
	if (str === "") {
		return false;
	}
	const num = Number(str);
	return num >= 0;
}

/**
 * R2 bucket names must only contain alphanumeric and - characters.
 */
export function isValidR2BucketName(name: string | undefined): name is string {
	return typeof name === "string" && /^[a-zA-Z][a-zA-Z0-9-]*$/.test(name);
}
