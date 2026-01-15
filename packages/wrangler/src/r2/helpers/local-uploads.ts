import { fetchResult } from "../../cfetch";
import type { ComplianceConfig } from "@cloudflare/workers-utils";
import type { HeadersInit } from "undici";

export interface LocalUploadsConfig {
	enabled: boolean;
}

/**
 * Get the local uploads configuration for an R2 bucket.
 */
export async function getR2LocalUploads(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	jurisdiction?: string
): Promise<LocalUploadsConfig> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	const result = await fetchResult<LocalUploadsConfig>(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}/local-uploads`,
		{
			method: "GET",
			headers,
		}
	);
	return result;
}

/**
 * Set the local uploads configuration for an R2 bucket.
 */
export async function setR2LocalUploads(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	enabled: boolean,
	jurisdiction?: string
): Promise<LocalUploadsConfig> {
	const headers: HeadersInit = {
		"Content-Type": "application/json",
	};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	const result = await fetchResult<LocalUploadsConfig>(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}/local-uploads`,
		{
			method: "PUT",
			headers,
			body: JSON.stringify({ enabled }),
		}
	);
	return result;
}
