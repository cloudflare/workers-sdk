import { fetchResult } from "../../../cfetch";
import type { ComplianceConfig } from "@cloudflare/workers-utils";
import type { HeadersInit } from "undici";

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

export async function getCustomDomain(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	domainName: string,
	jurisdiction?: string
): Promise<CustomDomainInfo> {
	const headers: HeadersInit = {};
	if (jurisdiction) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	const result = await fetchResult<CustomDomainInfo>(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}/domains/custom/${domainName}`,
		{
			method: "GET",
			headers,
		}
	);

	return result;
}

export async function attachCustomDomainToBucket(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	domainConfig: CustomDomainConfig,
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
		`/accounts/${accountId}/r2/buckets/${bucketName}/domains/custom`,
		{
			method: "POST",
			headers,
			body: JSON.stringify({
				...domainConfig,
				enabled: true,
			}),
		}
	);
}

export async function removeCustomDomainFromBucket(
	complianceConfig: ComplianceConfig,
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
		complianceConfig,
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
	complianceConfig: ComplianceConfig,
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
	}>(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}/domains/custom`,
		{
			method: "GET",
			headers,
		}
	);

	return result.domains;
}

export async function configureCustomDomainSettings(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	domainName: string,
	domainConfig: CustomDomainConfig,
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
		`/accounts/${accountId}/r2/buckets/${bucketName}/domains/custom/${domainName}`,
		{
			method: "PUT",
			headers,
			body: JSON.stringify(domainConfig),
		}
	);
}

export interface R2DevDomainInfo {
	bucketId: string;
	domain: string;
	enabled: boolean;
}

export async function getR2DevDomain(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	jurisdiction?: string
): Promise<R2DevDomainInfo> {
	const headers: HeadersInit = {};
	if (jurisdiction) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	const result = await fetchResult<R2DevDomainInfo>(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}/domains/managed`,
		{
			method: "GET",
			headers,
		}
	);
	return result;
}

export async function updateR2DevDomain(
	complianceConfig: ComplianceConfig,
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
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}/domains/managed`,
		{
			method: "PUT",
			headers,
			body: JSON.stringify({ enabled }),
		}
	);
	return result;
}
