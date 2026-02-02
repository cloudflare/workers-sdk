import { fetchResult } from "../../../cfetch";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

export interface LocalUploadsConfig {
	enabled: boolean;
}

/**
 * Get the local uploads configuration for an R2 bucket.
 * @see https://developers.cloudflare.com/r2/buckets/local-uploads
 */
export async function getR2LocalUploadsConfig(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string
): Promise<LocalUploadsConfig> {
	return await fetchResult<LocalUploadsConfig>(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}/local-uploads`,
		{
			method: "GET",
		}
	);
}

/**
 * Set the local uploads configuration for an R2 bucket.
 * @see https://developers.cloudflare.com/r2/buckets/local-uploads
 */
export async function setR2LocalUploadsConfig(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	enabled: boolean
): Promise<LocalUploadsConfig> {
	return await fetchResult<LocalUploadsConfig>(
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
}
