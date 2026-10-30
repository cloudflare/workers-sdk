import { DEFAULT_COMPAT_DATE } from "./default-compat-date";
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

type RoutesRes = {
	id: string;
	pattern: string;
	zone_name: string;
	script: string;
}[];

// Keep SDK response shapes structural so consumers do not need the SDK's
// declarations. The type assertions in the tests track changes to these shapes.
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
	domains: {
		id?: string;
		environment?: string;
		hostname?: string;
		service?: string;
		zone_id?: string;
		zone_name?: string;
	}[];
	/* sourced from https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/schedules/methods/get/ */
	schedules: {
		cron: string;
		created_on?: string;
		modified_on?: string;
	}[];

	/* sourced from https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/subresources/versions/methods/get/ using `{version_id}` of `latest` */
	assets?: AssetConfig;
	bindings: WorkerMetadata["bindings"];
	observability:
		| {
				enabled?: boolean;
				head_sampling_rate?: number;
				logs?: {
					enabled?: boolean;
					head_sampling_rate?: number;
					invocation_logs?: boolean;
				};
		  }
		| undefined;
	limits: { cpu_ms?: number; subrequests?: number } | undefined;
	placement: { mode?: "smart" } | undefined;
	subdomain: {
		enabled: boolean;
		previews_enabled: boolean;
	};
}

/**
 * Given information about a Worker,
 * construct a Wrangler config file for the application.
 *
 * @param config - The Worker configuration sourced from the Cloudflare API
 * @returns A Wrangler-compatible raw config object
 */
export function constructWranglerConfig(config: APIWorkerConfig): RawConfig {
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
			enabled: (c as typeof c & { enabled: boolean }).enabled,
			previews_enabled: (c as typeof c & { previews_enabled: boolean })
				.previews_enabled,
		})),
	];

	return {
		name: config.name,
		main: config.entrypoint,
		workers_dev: config.subdomain.enabled,
		preview_urls: config.subdomain.previews_enabled,
		compatibility_date: config.compatibility_date ?? DEFAULT_COMPAT_DATE,
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
