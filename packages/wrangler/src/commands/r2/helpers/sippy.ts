import { fetchResult } from "../../../cfetch";
import type { ComplianceConfig } from "@cloudflare/workers-utils";
import type { HeadersInit } from "undici";

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
 * Retrieve the sippy upstream bucket for the bucket with the given name
 */
export async function getR2Sippy(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	jurisdiction?: string
): Promise<SippyConfig> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	return await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}/sippy`,
		{ method: "GET", headers }
	);
}

/**
 * Disable sippy on the bucket with the given name
 */
export async function deleteR2Sippy(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	jurisdiction?: string
): Promise<void> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	return await fetchResult(
		complianceConfig,
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
	complianceConfig: ComplianceConfig,
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
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}/sippy`,
		{ method: "PUT", body: JSON.stringify(params), headers }
	);
}
