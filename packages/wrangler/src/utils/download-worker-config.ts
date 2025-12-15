import {
	COMPLIANCE_REGION_CONFIG_UNKNOWN,
	constructWranglerConfig,
} from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import type {
	RawConfig,
	ServiceMetadataRes,
	WorkerMetadata,
} from "@cloudflare/workers-utils";

type CustomDomainsRes = {
	id: string;
	zone_id: string;
	zone_name: string;
	hostname: string;
	service: string;
	environment: string;
	cert_id: string;
}[];

type WorkerSubdomainRes = {
	enabled: boolean;
	previews_enabled: boolean;
};
type CronTriggersRes = {
	schedules: {
		cron: string;
		created_on: Date;
		modified_on: Date;
	}[];
};

type RoutesRes = {
	id: string;
	pattern: string;
	zone_name: string;
	script: string;
}[];

/**
 * Downloads all information required to construct a Wrangler config file for a Worker from the API
 */
export async function fetchWorkerConfig(
	accountId: string,
	workerName: string,
	environment: string
) {
	const [
		bindings,
		routes,
		customDomains,
		subdomainStatus,
		serviceEnvMetadata,
		cronTriggers,
	] = await Promise.all([
		fetchResult<WorkerMetadata["bindings"]>(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			`/accounts/${accountId}/workers/services/${workerName}/environments/${environment}/bindings`
		),
		fetchResult<RoutesRes>(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			`/accounts/${accountId}/workers/services/${workerName}/environments/${environment}/routes?show_zonename=true`
		),
		fetchResult<CustomDomainsRes>(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			`/accounts/${accountId}/workers/domains/records?page=0&per_page=5&service=${workerName}&environment=${environment}`
		),
		fetchResult<WorkerSubdomainRes>(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			`/accounts/${accountId}/workers/services/${workerName}/environments/${environment}/subdomain`
		),
		fetchResult<ServiceMetadataRes["default_environment"]>(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			`/accounts/${accountId}/workers/services/${workerName}/environments/${environment}`
		),
		fetchResult<CronTriggersRes>(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			`/accounts/${accountId}/workers/scripts/${workerName}/schedules`
		),
	]).catch((e) => {
		throw new Error(
			`Error Occurred: Unable to fetch bindings, routes, or services metadata from the dashboard. Please try again later.`,
			{ cause: e }
		);
	});
	return {
		bindings,
		routes,
		customDomains,
		subdomainStatus,
		serviceEnvMetadata,
		cronTriggers,
	};
}

/**
 * Downloads all the remote information we can gather for a worker and from them generates a raw configuration object that
 * approximates what a wrangler config object for the worker was/would have been.
 *
 * @param workerName The name of the worker
 * @param environment The target environment for the worker
 * @param entrypoint The worker's entrypoint
 * @param accountId The ID of the account owning the worker
 * @returns A RawConfig object that bests represents the remote configuration of the worker
 */
export async function downloadWorkerConfig(
	workerName: string,
	environment: string,
	entrypoint: string,
	accountId: string
): Promise<RawConfig> {
	const {
		bindings,
		routes,
		customDomains,
		subdomainStatus,
		serviceEnvMetadata,
		cronTriggers,
	} = await fetchWorkerConfig(accountId, workerName, environment);

	return constructWranglerConfig({
		name: workerName,
		entrypoint,
		compatibility_date: serviceEnvMetadata.script.compatibility_date,
		compatibility_flags: serviceEnvMetadata.script.compatibility_flags,
		tags: serviceEnvMetadata.script.tags,
		migration_tag: serviceEnvMetadata.script.migration_tag,
		tail_consumers: serviceEnvMetadata.script.tail_consumers,
		observability: serviceEnvMetadata.script.observability,
		limits: serviceEnvMetadata.script.limits,
		bindings,
		routes,
		domains: customDomains,
		subdomain: subdomainStatus,
		schedules: cronTriggers.schedules.map((s) => ({
			cron: s.cron,
		})),
		placement: serviceEnvMetadata.script.placement_mode
			? { mode: serviceEnvMetadata.script.placement_mode }
			: undefined,
		logpush: undefined,
	});
}
