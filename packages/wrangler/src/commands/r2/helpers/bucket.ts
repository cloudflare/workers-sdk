import prettyBytes from "pretty-bytes";
import { fetchGraphqlResult, fetchResult } from "../../../cfetch";
import type { ComplianceConfig } from "@cloudflare/workers-utils";
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
	complianceConfig: ComplianceConfig,
	accountId: string,
	jurisdiction?: string
): Promise<R2BucketInfo[]> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	const results = await fetchResult<{
		buckets: R2BucketInfo[];
	}>(complianceConfig, `/accounts/${accountId}/r2/buckets`, { headers });
	return results.buckets;
}

export function tableFromR2BucketsListResponse(buckets: R2BucketInfo[]): {
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
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	jurisdiction?: string
): Promise<R2BucketInfo> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	const result = await fetchResult<R2BucketInfo>(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}`,
		{
			method: "GET",
			headers,
		}
	);
	return result;
}

export async function getR2BucketMetrics(
	complianceConfig: ComplianceConfig,
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
		await fetchGraphqlResult<R2BucketMetricsGraphQLResponse>(complianceConfig, {
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
	complianceConfig: ComplianceConfig,
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
	return await fetchResult<void>(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets`,
		{
			method: "POST",
			body: JSON.stringify({
				name: bucketName,
				...(storageClass !== undefined && { storageClass }),
				...(location !== undefined && { locationHint: location }),
			}),
			headers,
		}
	);
}

/**
 * Update the default storage class to `storageClass` of a bucket with the given `bucketName`
 * within the account given by `accountId`.
 */
export async function updateR2BucketStorageClass(
	complianceConfig: ComplianceConfig,
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
		complianceConfig,
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
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	jurisdiction?: string
): Promise<void> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	return await fetchResult<void>(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}`,
		{ method: "DELETE", headers }
	);
}

export interface CORSRule {
	allowed?: {
		origins?: string[];
		methods?: string[];
		headers?: string[];
	};
	exposeHeaders?: string[];
	maxAgeSeconds?: number;
}

export async function getCORSPolicy(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	jurisdiction?: string
): Promise<CORSRule[]> {
	const headers: HeadersInit = {};
	if (jurisdiction) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	const result = await fetchResult<{ rules: CORSRule[] }>(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}/cors`,
		{
			method: "GET",
			headers,
		}
	);
	return result.rules;
}

export function tableFromCORSPolicyResponse(rules: CORSRule[]): {
	allowed_origins: string;
	allowed_methods: string;
	allowed_headers: string;
	exposed_headers: string;
	max_age_seconds: string;
}[] {
	const rows = [];
	for (const rule of rules) {
		rows.push({
			allowed_origins: rule.allowed?.origins?.join(", ") || "(no origins)",
			allowed_methods: rule.allowed?.methods?.join(", ") || "(no methods)",
			allowed_headers: rule.allowed?.headers?.join(", ") || "(no headers)",
			exposed_headers: rule.exposeHeaders?.join(", ") || "(no exposed headers)",
			max_age_seconds: rule.maxAgeSeconds?.toString() || "(0 seconds)",
		});
	}
	return rows;
}

export async function putCORSPolicy(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	rules: CORSRule[],
	jurisdiction?: string
): Promise<void> {
	const headers: HeadersInit = {
		"Content-Type": "application/json",
	};
	if (jurisdiction) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}/cors`,
		{
			method: "PUT",
			headers,
			body: JSON.stringify({ rules: rules }),
		}
	);
}

export async function deleteCORSPolicy(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	jurisdiction?: string
): Promise<void> {
	const headers: HeadersInit = {};
	if (jurisdiction) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}/cors`,
		{
			method: "DELETE",
			headers,
		}
	);
}

export interface BucketLockRule {
	id: string;
	enabled: boolean;
	prefix?: string;
	condition: BucketLockRuleCondition;
}

export interface BucketLockRuleCondition {
	type: "Age" | "Date" | "Indefinite";
	maxAgeSeconds?: number;
	date?: string;
}

export function tableFromBucketLockRulesResponse(rules: BucketLockRule[]): {
	name: string;
	enabled: string;
	prefix: string;
	condition: string;
}[] {
	const rows = [];
	for (const rule of rules) {
		const conditionString = formatLockCondition(rule.condition);
		rows.push({
			name: rule.id,
			enabled: rule.enabled ? "Yes" : "No",
			prefix: rule.prefix || "(all prefixes)",
			condition: conditionString,
		});
	}
	return rows;
}

function formatLockCondition(condition: BucketLockRuleCondition): string {
	if (condition.type === "Age" && typeof condition.maxAgeSeconds === "number") {
		const days = condition.maxAgeSeconds / 86400; // Convert seconds to days
		if (days == 1) {
			return `after ${days} day`;
		} else {
			return `after ${days} days`;
		}
	} else if (condition.type === "Date" && condition.date) {
		const date = new Date(condition.date);
		const displayDate = date.toISOString().split("T")[0];
		return `on ${displayDate}`;
	}

	return `indefinitely`;
}

export async function getBucketLockRules(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucket: string,
	jurisdiction?: string
): Promise<BucketLockRule[]> {
	const headers: HeadersInit = {};
	if (jurisdiction) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	const result = await fetchResult<{ rules: BucketLockRule[] }>(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucket}/lock`,
		{
			method: "GET",
			headers,
		}
	);
	return result.rules;
}

export async function putBucketLockRules(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucket: string,
	rules: BucketLockRule[],
	jurisdiction?: string
): Promise<void> {
	const headers: HeadersInit = {
		"Content-Type": "application/json",
	};
	if (jurisdiction) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucket}/lock`,
		{
			method: "PUT",
			headers,
			body: JSON.stringify({ rules: rules }),
		}
	);
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
	name: string;
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
			name: rule.id,
			enabled: rule.enabled ? "Yes" : "No",
			prefix: rule.conditions.prefix || "(all prefixes)",
			action: actions.join(", ") || "(none)",
		});
	}
	return rows;
}

export async function getLifecycleRules(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucket: string,
	jurisdiction?: string
): Promise<LifecycleRule[]> {
	const headers: HeadersInit = {};
	if (jurisdiction) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	const result = await fetchResult<{ rules: LifecycleRule[] }>(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucket}/lifecycle`,
		{
			method: "GET",
			headers,
		}
	);
	return result.rules;
}

export async function putLifecycleRules(
	complianceConfig: ComplianceConfig,
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

	await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucket}/lifecycle`,
		{
			method: "PUT",
			headers,
			body: JSON.stringify({ rules: rules }),
		}
	);
}
