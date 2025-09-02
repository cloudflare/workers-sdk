import { fetchResult } from "../cfetch";
import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "../environment-variables/misc-variables";
import { formatCompatibilityDate } from "./compatibility-date";
import { mapWorkerMetadataBindings } from "./map-worker-metadata-bindings";
import type { RawConfig } from "../config";
import type {
	CustomDomainRoute,
	Route,
	ZoneNameRoute,
} from "../config/environment";
import type { WorkerMetadata } from "../deployment-bundle/create-worker-upload-form";
import type { ServiceMetadataRes } from "../init";

type RoutesRes = {
	id: string;
	pattern: string;
	zone_name: string;
	script: string;
}[];

type CustomDomainsRes = {
	id: string;
	zone_id: string;
	zone_name: string;
	hostname: string;
	service: string;
	environment: string;
	cert_id: string;
}[];

type WorkersDevRes = {
	enabled: boolean;
};
type CronTriggersRes = {
	schedules: {
		cron: string;
		created_on: Date;
		modified_on: Date;
	}[];
};

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
	const [
		bindings,
		routes,
		customDomains,
		workersDev,
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
		fetchResult<WorkersDevRes>(
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

	const mappedBindings = await mapWorkerMetadataBindings(
		bindings,
		accountId,
		COMPLIANCE_REGION_CONFIG_UNKNOWN
	);

	const durableObjectClassNames = bindings
		.filter((binding) => binding.type === "durable_object_namespace")
		.map(
			(durableObject) => (durableObject as { class_name: string }).class_name
		);

	const allRoutes: Route[] = [
		...routes.map<ZoneNameRoute>((r) => ({
			pattern: r.pattern,
			zone_name: r.zone_name,
		})),
		...customDomains.map<CustomDomainRoute>((c) => ({
			pattern: c.hostname,
			zone_name: c.zone_name,
			custom_domain: true,
		})),
	];

	return {
		name: workerName,
		main: entrypoint,
		workers_dev: workersDev.enabled,
		compatibility_date:
			serviceEnvMetadata.script.compatibility_date ??
			formatCompatibilityDate(new Date()),
		compatibility_flags: serviceEnvMetadata.script.compatibility_flags,
		...(allRoutes.length ? { routes: allRoutes } : {}),
		placement:
			serviceEnvMetadata.script.placement_mode === "smart"
				? { mode: "smart" }
				: undefined,
		limits: serviceEnvMetadata.script.limits,
		...(durableObjectClassNames.length
			? {
					migrations: [
						{
							tag: serviceEnvMetadata.script.migration_tag,
							new_classes: durableObjectClassNames,
						},
					],
				}
			: {}),
		...(cronTriggers.schedules.length
			? {
					triggers: {
						crons: cronTriggers.schedules.map((scheduled) => scheduled.cron),
					},
				}
			: {}),
		tail_consumers: serviceEnvMetadata.script.tail_consumers ?? undefined,
		observability: serviceEnvMetadata.script.observability,
		...mappedBindings,
	};
}
