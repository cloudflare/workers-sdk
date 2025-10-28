import { ENVIRONMENT_TAG_PREFIX, SERVICE_TAG_PREFIX } from "./constants";
import { formatCompatibilityDate } from "./format-compatibility-date";
import { mapWorkerMetadataBindings } from "./map-worker-metadata-bindings";
import type { RawConfig } from "./config";
import type {
	CustomDomainRoute,
	Route,
	ZoneNameRoute,
} from "./config/environment";
import type { ServiceMetadataRes, WorkerMetadata } from "./types";

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

export interface FullWorkerConfig {
	bindings: WorkerMetadata["bindings"];
	routes: RoutesRes;
	customDomains: CustomDomainsRes;
	subdomainStatus: WorkerSubdomainRes;
	serviceEnvMetadata: ServiceMetadataRes["default_environment"];
	cronTriggers: CronTriggersRes;
}

function convertWorkerToWranglerConfig(
	workerName: string,
	entrypoint: string,
	{
		bindings,
		routes,
		customDomains,
		subdomainStatus,
		serviceEnvMetadata,
		cronTriggers,
	}: FullWorkerConfig
): RawConfig {
	const mappedBindings = mapWorkerMetadataBindings(bindings);

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
		workers_dev: subdomainStatus.enabled,
		preview_urls: subdomainStatus.previews_enabled,
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

/**
 * Given the information of multiple Workers (representing different environments),
 * construct a Wrangler config file for the application.
 */
export function constructWranglerConfig(
	workerName: string,
	entrypoint: string,
	workerOrWorkers: FullWorkerConfig | FullWorkerConfig[]
): RawConfig {
	let workers: FullWorkerConfig[];
	if (Array.isArray(workerOrWorkers)) {
		workers = workerOrWorkers;
	} else {
		workers = [workerOrWorkers];
	}

	const topLevelEnv = workers.find(
		(w) =>
			!w.serviceEnvMetadata.script.tags?.some((t) =>
				t.startsWith(ENVIRONMENT_TAG_PREFIX)
			)
	);
	let combinedConfig: RawConfig;
	if (topLevelEnv) {
		combinedConfig = convertWorkerToWranglerConfig(
			workerName,
			entrypoint,
			topLevelEnv
		);
	} else {
		// Make a synthetic top level environment
		combinedConfig = {
			name: workerName,
			main: entrypoint,
		};
	}

	for (const env of workers) {
		const serviceTag = env.serviceEnvMetadata.script.tags?.find(
			(t) => t === `${SERVICE_TAG_PREFIX}${workerName}`
		);
		const envTag = env.serviceEnvMetadata.script.tags?.find((t) =>
			t.startsWith(ENVIRONMENT_TAG_PREFIX)
		);
		if (serviceTag !== workerName || envTag === undefined) {
			continue;
		}
		const [_, envName] = envTag.split("=");
		combinedConfig.env ??= {};
		combinedConfig.env[envName] = convertWorkerToWranglerConfig(
			workerName,
			entrypoint,
			env
		);
	}
	return combinedConfig;
}
