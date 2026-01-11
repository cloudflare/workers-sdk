import { fetchResult } from "../../cfetch";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

export interface LocalUploadsConfig {
	enabled: boolean;
}

/**
 * Get the local uploads configuration for an R2 bucket.
 */
export async function getR2LocalUploads(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string
): Promise<LocalUploadsConfig> {
	const result = await fetchResult<LocalUploadsConfig>(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}/local-uploads`,
		{
			method: "GET",
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
	enabled: boolean
): Promise<LocalUploadsConfig> {
	const result = await fetchResult<LocalUploadsConfig>(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}/local-uploads`,
		{
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ enabled }),
		}
	);
	return result;
}
