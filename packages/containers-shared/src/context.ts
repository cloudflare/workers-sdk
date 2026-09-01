import type {
	ComplianceConfig,
	FetchResultFetcher,
} from "@cloudflare/workers-utils";

export type ContainersSharedContext = {
	accountId: string;
	fetchResult: FetchResultFetcher;
};

export let accountId: string;
export let fetchResult: FetchResultFetcher;

export function initContainersSharedContext(
	ctx: ContainersSharedContext
): void {
	accountId = ctx.accountId;
	fetchResult = ctx.fetchResult;
}

export function getRegistryCredentialsResource(domain: string): string {
	return `/accounts/${accountId}/containers/registries/${domain}/credentials`;
}

export type RegistryCredentialsComplianceConfig = ComplianceConfig;
