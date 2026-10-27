import { constructWranglerConfig } from "@cloudflare/workers-utils";
import { fetchResult } from "../../shared/context";
import type {
	ComplianceConfig,
	RawConfig,
	Route,
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
	enabled: boolean;
	previews_enabled: boolean;
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
 * Downloads the information required to construct a Wrangler config file for a Worker from the API.
 * When `localRoutes` is provided, only fetches the route categories that the
 * current deployment can change. Omit it when downloading a complete config.
 */
export async function fetchWorkerConfig(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	environment: string,
	localRoutes?: Route[]
) {
	const fetchRoutes =
		localRoutes === undefined ||
		localRoutes.some(
			(route) => typeof route === "string" || !route.custom_domain
		);
	const fetchCustomDomains =
		localRoutes === undefined ||
		localRoutes.some(
			(route) => typeof route !== "string" && route.custom_domain
		);
	const [
		bindings,
		routes,
		customDomains,
		subdomainStatus,
		serviceEnvMetadata,
		cronTriggers,
	] = await Promise.all([
		fetchResult<WorkerMetadata["bindings"]>(
			complianceConfig,
			`/accounts/${accountId}/workers/services/${workerName}/environments/${environment}/bindings`
		),
		fetchRoutes
			? fetchResult<RoutesRes>(
					complianceConfig,
					`/accounts/${accountId}/workers/services/${workerName}/environments/${environment}/routes?show_zonename=true`
				)
			: Promise.resolve([]),
		fetchCustomDomains
			? fetchResult<CustomDomainsRes>(
					complianceConfig,
					`/accounts/${accountId}/workers/domains/records?page=0&per_page=5&service=${workerName}&environment=${environment}`
				)
			: Promise.resolve([]),
		fetchResult<WorkerSubdomainRes>(
			complianceConfig,
			`/accounts/${accountId}/workers/services/${workerName}/environments/${environment}/subdomain`
		),
		fetchResult<ServiceMetadataRes["default_environment"]>(
			complianceConfig,
			`/accounts/${accountId}/workers/services/${workerName}/environments/${environment}`
		),
		fetchResult<CronTriggersRes>(
			complianceConfig,
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
 * When `localRoutes` is provided, route metadata is limited to categories that
 * the current deployment can change. Omit it when downloading a complete config.
 */
export async function downloadWorkerConfig(
	complianceConfig: ComplianceConfig,
	workerName: string,
	environment: string,
	entrypoint: string,
	accountId: string,
	localRoutes?: Route[]
): Promise<RawConfig> {
	const {
		bindings,
		routes,
		customDomains,
		subdomainStatus,
		serviceEnvMetadata,
		cronTriggers,
	} = await fetchWorkerConfig(
		complianceConfig,
		accountId,
		workerName,
		environment,
		localRoutes
	);

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
