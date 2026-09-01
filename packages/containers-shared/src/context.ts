import type {
	ComplianceConfig,
	FetchResultFetcher,
} from "@cloudflare/workers-utils";

export type ContainersSharedContext = {
	accountId: string;
	apiFamily: ContainersApiFamily;
	fetchResult: FetchResultFetcher;
};

export type ContainersApiFamily = "containers" | "cloudchamber";

export let accountId: string;
export let apiFamily: ContainersApiFamily;
export let fetchResult: FetchResultFetcher;

export function initContainersSharedContext(
	ctx: ContainersSharedContext
): void {
	accountId = ctx.accountId;
	apiFamily = ctx.apiFamily;
	fetchResult = ctx.fetchResult;
}

export function getRegistryCredentialsResource(domain: string): string {
	return `/accounts/${accountId}/${apiFamily}/registries/${domain}/credentials`;
}

export function getAccountDetailsResource(): string {
	return `/accounts/${accountId}/${apiFamily}/me`;
}

export type RegistryCredentialsComplianceConfig = ComplianceConfig;
