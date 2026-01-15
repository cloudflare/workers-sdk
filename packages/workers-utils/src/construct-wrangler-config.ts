import { formatCompatibilityDate } from "./compatibility-date";
import { ENVIRONMENT_TAG_PREFIX, SERVICE_TAG_PREFIX } from "./constants";
import { mapWorkerMetadataBindings } from "./map-worker-metadata-bindings";
import type { RawConfig } from "./config";
import type {
	CustomDomainRoute,
	Route,
	TailConsumer,
	ZoneNameRoute,
} from "./config/environment";
import type { WorkerMetadata } from "./types";
import type { AssetConfig } from "@cloudflare/workers-shared";
import type { Cloudflare } from "cloudflare";

type RoutesRes = {
	id: string;
	pattern: string;
	zone_name: string;
	script: string;
}[];

interface APIWorkerConfig {
	/* sourced from https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/list/ */
	name: string; // property renamed from `id`...
	entrypoint: string;
	tags: string[] | null;
	compatibility_date: string;
	compatibility_flags: string[];
	logpush: boolean | undefined;
	routes: RoutesRes;
	tail_consumers: TailConsumer[] | undefined | null;
	migration_tag?: string;

	/* sourced from https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/list/ */
	domains: Cloudflare.Workers.Domain[];
	/* sourced from https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/schedules/methods/get/ */
	schedules: Cloudflare.Workers.Scripts.Schedules.ScheduleGetResponse.Schedule[];

	/* sourced from https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/subresources/versions/methods/get/ using `{version_id}` of `latest` */
	assets?: AssetConfig;
	bindings: WorkerMetadata["bindings"];
	observability: Cloudflare.Workers.Beta.Worker.Observability | undefined;
	limits: { cpu_ms?: number; subrequests?: number } | undefined;
	placement: Cloudflare.Workers.Beta.Workers.Version.Placement | undefined;
	subdomain: {
		enabled: boolean;
		previews_enabled: boolean;
	};
}

function convertWorkerToWranglerConfig(config: APIWorkerConfig): RawConfig {
	const mappedBindings = mapWorkerMetadataBindings(config.bindings);

	const durableObjectClassNames = config.bindings
		.filter(
			(binding) =>
				binding.type === "durable_object_namespace" &&
				binding.script_name === config.name
		)
		.map(
			(durableObject) => (durableObject as { class_name: string }).class_name
		);

	const allRoutes: Route[] = [
		...config.routes.map<ZoneNameRoute>((r) => ({
			pattern: r.pattern,
			zone_name: r.zone_name,
		})),
		...config.domains.map<CustomDomainRoute>((c) => ({
			pattern: c.hostname as string,
			zone_name: c.zone_name,
			custom_domain: true,
		})),
	];

	return {
		name: config.name,
		main: config.entrypoint,
		workers_dev: config.subdomain.enabled,
		preview_urls: config.subdomain.previews_enabled,
		compatibility_date:
			config.compatibility_date ?? formatCompatibilityDate(new Date()),
		compatibility_flags: config.compatibility_flags,
		...(allRoutes.length ? { routes: allRoutes } : {}),
		placement:
			config.placement?.mode === "smart" ? { mode: "smart" } : undefined,
		limits: config.limits,
		...(durableObjectClassNames.length && config.migration_tag
			? {
					migrations: [
						{
							tag: config.migration_tag,
							new_classes: durableObjectClassNames,
						},
					],
				}
			: {}),
		...(config.schedules.length
			? {
					triggers: {
						crons: config.schedules.map((scheduled) => scheduled.cron),
					},
				}
			: {}),
		tail_consumers: config.tail_consumers ?? undefined,
		observability: config.observability,
		...mappedBindings,
	};
}

/**
 * Given the information of multiple Workers (representing different environments),
 * construct a Wrangler config file for the application.
 */
export function constructWranglerConfig(
	workerOrWorkers: APIWorkerConfig | APIWorkerConfig[]
): RawConfig {
	let workers: APIWorkerConfig[];
	if (Array.isArray(workerOrWorkers)) {
		workers = workerOrWorkers;
	} else {
		workers = [workerOrWorkers];
	}

	const topLevelEnv = workers.find(
		(w) => !w.tags?.some((t) => t.startsWith(ENVIRONMENT_TAG_PREFIX))
	);
	const workerName = topLevelEnv?.name ?? workers[0].name;
	const entrypoint = topLevelEnv?.entrypoint ?? workers[0].entrypoint;
	let combinedConfig: RawConfig;
	if (topLevelEnv) {
		combinedConfig = convertWorkerToWranglerConfig(topLevelEnv);
	} else {
		// Make a synthetic top level environment
		combinedConfig = {
			name: workerName,
			main: entrypoint,
		};
	}

	for (const env of workers) {
		const serviceTag = env.tags?.find(
			(t) => t === `${SERVICE_TAG_PREFIX}${workerName}`
		);
		const envTag = env.tags?.find((t) => t.startsWith(ENVIRONMENT_TAG_PREFIX));
		if (
			serviceTag !== `${SERVICE_TAG_PREFIX}${workerName}` ||
			envTag === undefined
		) {
			continue;
		}
		const [_, envName] = envTag.split("=");
		combinedConfig.env ??= {};
		combinedConfig.env[envName] = convertWorkerToWranglerConfig(env);
	}
	return combinedConfig;
}
