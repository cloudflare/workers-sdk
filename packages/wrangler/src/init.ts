import { mkdir, writeFile } from "node:fs/promises";
import path, { dirname } from "node:path";
import TOML from "@iarna/toml";
import { execa } from "execa";
import { assertNever } from "./api/startDevWorker/utils";
import { fetchResult } from "./cfetch";
import { fetchWorker } from "./cfetch/internal";
import { getDatabaseInfoFromIdOrName } from "./d1/utils";
import { getC3CommandFromEnv } from "./environment-variables/misc-variables";
import { FatalError, UserError } from "./errors";
import { logger } from "./logger";
import { readMetricsConfig } from "./metrics/metrics-config";
import { getPackageManager } from "./package-manager";
import { requireAuth } from "./user";
import { createBatches } from "./utils/create-batches";
import * as shellquote from "./utils/shell-quote";
import { printWranglerBanner } from "./wrangler-banner";
import type { RawConfig } from "./config";
import type {
	CustomDomainRoute,
	Observability,
	Route,
	TailConsumer,
	ZoneNameRoute,
} from "./config/environment";
import type { DatabaseInfo } from "./d1/types";
import type {
	WorkerMetadata,
	WorkerMetadataBinding,
} from "./deployment-bundle/create-worker-upload-form";
import type { PackageManager } from "./package-manager";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "./yargs-types";
import type { ReadableStream } from "stream/web";

export function initOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("name", {
			describe: "The name of your worker",
			type: "string",
		})
		.option("yes", {
			describe: 'Answer "yes" to any prompts for new projects',
			type: "boolean",
			alias: "y",
		})
		.option("from-dash", {
			describe:
				"The name of the Worker you wish to download from the Cloudflare dashboard for local development.",
			type: "string",
			requiresArg: true,
		})
		.option("delegate-c3", {
			describe: "Delegate to Create Cloudflare CLI (C3)",
			type: "boolean",
			hidden: true,
			default: true,
			alias: "c3",
		});
}

type InitArgs = StrictYargsOptionsToInterface<typeof initOptions>;

export type ServiceMetadataRes = {
	id: string;
	default_environment: {
		environment: string;
		created_on: string;
		modified_on: string;
		script: {
			id: string;
			tag: string;
			etag: string;
			handlers: string[];
			modified_on: string;
			created_on: string;
			migration_tag: string;
			usage_model: "bundled" | "unbound";
			limits: {
				cpu_ms: number;
			};
			compatibility_date: string;
			compatibility_flags: string[];
			last_deployed_from?: "wrangler" | "dash" | "api";
			placement_mode?: "smart";
			tail_consumers?: TailConsumer[];
			observability?: Observability;
		};
	};
	created_on: string;
	modified_on: string;
	usage_model: "bundled" | "unbound";
	environments: [
		{
			environment: string;
			created_on: string;
			modified_on: string;
		},
	];
};

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
	schedules: [
		{
			cron: string;
			created_on: Date;
			modified_on: Date;
		},
	];
};

function isNpm(packageManager: PackageManager) {
	return packageManager.type === "npm";
}

export async function initHandler(args: InitArgs) {
	await printWranglerBanner();

	const yesFlag = args.yes ?? false;

	const packageManager = await getPackageManager();

	const name = args.fromDash ?? args.name;

	const c3Arguments = [
		...shellquote.parse(getC3CommandFromEnv()),
		...(name ? [name] : []),
		...(yesFlag && isNpm(packageManager) ? ["-y"] : []), // --yes arg for npx
		...(isNpm(packageManager) ? ["--"] : []),
		...(args.fromDash ? ["--existing-script", args.fromDash] : []),
		...(yesFlag ? ["--wrangler-defaults"] : []),
	];
	const replacementC3Command = `\`${packageManager.type} ${c3Arguments.join(
		" "
	)}\``;

	if (args.fromDash && !args.delegateC3) {
		const accountId = await requireAuth({});
		try {
			await fetchResult<ServiceMetadataRes>(
				`/accounts/${accountId}/workers/services/${args.fromDash}`
			);
		} catch (err) {
			if ((err as { code?: number }).code === 10090) {
				throw new UserError(
					"wrangler couldn't find a Worker with that name in your account.\nRun `wrangler whoami` to confirm you're logged into the correct account."
				);
			}
			throw err;
		}

		const creationDir = path.join(process.cwd(), args.fromDash);

		await mkdir(creationDir, { recursive: true });
		const { modules, config } = await downloadWorker(accountId, args.fromDash);

		await mkdir(path.join(creationDir, "./src"), {
			recursive: true,
		});

		config.main = `src/${config.main}`;
		config.name = args.fromDash;

		// writeFile in small batches (of 10) to not exhaust system file descriptors
		for (const files of createBatches(modules, 10)) {
			await Promise.all(
				files.map(async (file) => {
					const filepath = path.join(creationDir, `./src/${file.name}`);
					const directory = dirname(filepath);

					await mkdir(directory, { recursive: true });
					await writeFile(filepath, file.stream() as ReadableStream);
				})
			);
		}

		await writeFile(
			path.join(creationDir, "wrangler.toml"),
			TOML.stringify(config as TOML.JsonMap)
		);
	} else {
		logger.log(`🌀 Running ${replacementC3Command}...`);

		// if telemetry is disabled in wrangler, prevent c3 from sending metrics too
		const metricsConfig = readMetricsConfig();
		await execa(packageManager.type, c3Arguments, {
			stdio: "inherit",
			...(metricsConfig.permission?.enabled === false && {
				env: { CREATE_CLOUDFLARE_TELEMETRY_DISABLED: "1" },
			}),
		});
	}
}

async function getWorkerConfig(
	accountId: string,
	workerName: string,
	entrypoint: string,
	serviceEnvironment: string
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
			`/accounts/${accountId}/workers/services/${workerName}/environments/${serviceEnvironment}/bindings`
		),
		fetchResult<RoutesRes>(
			`/accounts/${accountId}/workers/services/${workerName}/environments/${serviceEnvironment}/routes?show_zonename=true`
		),
		fetchResult<CustomDomainsRes>(
			`/accounts/${accountId}/workers/domains/records?page=0&per_page=5&service=${workerName}&environment=${serviceEnvironment}`
		),

		fetchResult<WorkersDevRes>(
			`/accounts/${accountId}/workers/services/${workerName}/environments/${serviceEnvironment}/subdomain`
		),

		fetchResult<ServiceMetadataRes["default_environment"]>(
			`/accounts/${accountId}/workers/services/${workerName}/environments/${serviceEnvironment}`
		),
		fetchResult<CronTriggersRes>(
			`/accounts/${accountId}/workers/scripts/${workerName}/schedules`
		),
	]).catch((e) => {
		throw new Error(
			`Error Occurred ${e}: Unable to fetch bindings, routes, or services metadata from the dashboard. Please try again later.`
		);
	});

	const mappedBindings = await mapBindings(accountId, bindings);

	const durableObjectClassNames = bindings
		.filter((binding) => binding.type === "durable_object_namespace")
		.map(
			(durableObject) => (durableObject as { class_name: string }).class_name
		);

	const allRoutes: Route[] = [
		...routes.map(
			(r) => ({ pattern: r.pattern, zone_name: r.zone_name }) as ZoneNameRoute
		),
		...customDomains.map(
			(c) =>
				({
					pattern: c.hostname,
					zone_name: c.zone_name,
					custom_domain: true,
				}) as CustomDomainRoute
		),
	];

	return {
		name: workerName,
		main: entrypoint,
		workers_dev: workersDev.enabled,
		compatibility_date:
			serviceEnvMetadata.script.compatibility_date ??
			new Date().toISOString().substring(0, 10),
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
		tail_consumers: serviceEnvMetadata.script.tail_consumers,
		observability: serviceEnvMetadata.script.observability,
		...mappedBindings,
	};
}

export async function mapBindings(
	accountId: string,
	bindings: WorkerMetadataBinding[]
): Promise<RawConfig> {
	//the binding API doesn't provide us with enough information to make a friendly user experience.
	//lets call D1's API to get more information
	const d1BindingsWithInfo: Record<string, DatabaseInfo> = {};
	await Promise.all(
		bindings
			.filter((binding) => binding.type === "d1")
			.map(async (binding) => {
				const dbInfo = await getDatabaseInfoFromIdOrName(accountId, binding.id);
				d1BindingsWithInfo[binding.id] = dbInfo;
			})
	);

	return (
		bindings
			.filter((binding) => (binding.type as string) !== "secret_text")
			// Combine the same types into {[type]: [binding]}
			.reduce((configObj, binding) => {
				// Some types have different names in wrangler.toml
				// I want the type safety of the binding being destructured after the case narrowing the union but type is unused

				switch (binding.type) {
					case "plain_text":
						{
							configObj.vars = {
								...(configObj.vars ?? {}),
								[binding.name]: binding.text,
							};
						}
						break;
					case "json":
						{
							configObj.vars = {
								...(configObj.vars ?? {}),
								name: binding.name,
								json: binding.json,
							};
						}
						break;
					case "kv_namespace":
						{
							configObj.kv_namespaces = [
								...(configObj.kv_namespaces ?? []),
								{ id: binding.namespace_id, binding: binding.name },
							];
						}
						break;
					case "durable_object_namespace":
						{
							configObj.durable_objects = {
								bindings: [
									...(configObj.durable_objects?.bindings ?? []),
									{
										name: binding.name,
										class_name: binding.class_name,
										script_name: binding.script_name,
										environment: binding.environment,
									},
								],
							};
						}
						break;
					case "d1":
						{
							configObj.d1_databases = [
								...(configObj.d1_databases ?? []),
								{
									binding: binding.name,
									database_id: binding.id,
									database_name: d1BindingsWithInfo[binding.id].name,
								},
							];
						}
						break;
					case "browser":
						{
							configObj.browser = {
								binding: binding.name,
							};
						}
						break;
					case "ai":
						{
							configObj.ai = {
								binding: binding.name,
							};
						}
						break;
					case "images":
						{
							configObj.images = {
								binding: binding.name,
							};
						}
						break;
					case "r2_bucket":
						{
							configObj.r2_buckets = [
								...(configObj.r2_buckets ?? []),
								{
									binding: binding.name,
									bucket_name: binding.bucket_name,
									jurisdiction: binding.jurisdiction,
								},
							];
						}
						break;
					case "service":
						{
							configObj.services = [
								...(configObj.services ?? []),
								{
									binding: binding.name,
									service: binding.service,
									environment: binding.environment,
									entrypoint: binding.entrypoint,
								},
							];
						}
						break;
					case "analytics_engine":
						{
							configObj.analytics_engine_datasets = [
								...(configObj.analytics_engine_datasets ?? []),
								{ binding: binding.name, dataset: binding.dataset },
							];
						}
						break;
					case "dispatch_namespace":
						{
							configObj.dispatch_namespaces = [
								...(configObj.dispatch_namespaces ?? []),
								{
									binding: binding.name,
									namespace: binding.namespace,
									...(binding.outbound && {
										outbound: {
											service: binding.outbound.worker.service,
											environment: binding.outbound.worker.environment,
											parameters:
												binding.outbound.params?.map((p) => p.name) ?? [],
										},
									}),
								},
							];
						}
						break;
					case "logfwdr":
						{
							configObj.logfwdr = {
								bindings: [
									...(configObj.logfwdr?.bindings ?? []),
									{ name: binding.name, destination: binding.destination },
								],
							};
						}
						break;
					case "wasm_module":
						{
							configObj.wasm_modules = {
								...(configObj.wasm_modules ?? {}),
								[binding.name]: binding.part,
							};
						}
						break;
					case "text_blob":
						{
							configObj.text_blobs = {
								...(configObj.text_blobs ?? {}),
								[binding.name]: binding.part,
							};
						}
						break;
					case "data_blob":
						{
							configObj.data_blobs = {
								...(configObj.data_blobs ?? {}),
								[binding.name]: binding.part,
							};
						}
						break;
					case "secret_text":
						// Ignore secrets
						break;
					case "version_metadata": {
						{
							configObj.version_metadata = {
								binding: binding.name,
							};
						}
						break;
					}
					case "send_email": {
						configObj.send_email = [
							...(configObj.send_email ?? []),
							{
								name: binding.name,
								destination_address: binding.destination_address,
								allowed_destination_addresses:
									binding.allowed_destination_addresses,
							},
						];
						break;
					}
					case "queue":
						configObj.queues ??= { producers: [] };
						configObj.queues.producers = [
							...(configObj.queues.producers ?? []),
							{
								binding: binding.name,
								queue: binding.queue_name,
								delivery_delay: binding.delivery_delay,
							},
						];
						break;
					case "vectorize":
						configObj.vectorize = [
							...(configObj.vectorize ?? []),
							{
								binding: binding.name,
								index_name: binding.index_name,
							},
						];
						break;
					case "hyperdrive":
						configObj.hyperdrive = [
							...(configObj.hyperdrive ?? []),
							{
								binding: binding.name,
								id: binding.id,
							},
						];
						break;
					case "mtls_certificate":
						configObj.mtls_certificates = [
							...(configObj.mtls_certificates ?? []),
							{
								binding: binding.name,
								certificate_id: binding.certificate_id,
							},
						];
						break;
					case "pipelines":
						configObj.pipelines = [
							...(configObj.pipelines ?? []),
							{
								binding: binding.name,
								pipeline: binding.pipeline,
							},
						];
						break;
					case "assets":
						throw new FatalError(
							"`wrangler init --from-dash` is not yet supported for Workers with Assets"
						);
					case "inherit":
						configObj.unsafe = {
							bindings: [...(configObj.unsafe?.bindings ?? []), binding],
							metadata: configObj.unsafe?.metadata ?? undefined,
						};
						break;
					case "workflow":
						{
							configObj.workflows = [
								...(configObj.workflows ?? []),
								{
									binding: binding.name,
									name: binding.workflow_name,
									class_name: binding.class_name,
									script_name: binding.script_name,
								},
							];
						}
						break;
					default: {
						configObj.unsafe = {
							bindings: [...(configObj.unsafe?.bindings ?? []), binding],
							metadata: configObj.unsafe?.metadata ?? undefined,
						};
						assertNever(binding);
					}
				}

				return configObj;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			}, {} as RawConfig)
	);
}

export async function downloadWorker(accountId: string, workerName: string) {
	const serviceMetadata = await fetchResult<ServiceMetadataRes>(
		`/accounts/${accountId}/workers/services/${workerName}`
	);

	const defaultEnvironment = serviceMetadata?.default_environment.environment;

	// Use the default environment, assuming it's the most up to date code.
	const { entrypoint, modules } = await fetchWorker(
		`/accounts/${accountId}/workers/services/${workerName}/environments/${defaultEnvironment}/content/v2`
	);

	const config = await getWorkerConfig(
		accountId,
		workerName,
		entrypoint,
		defaultEnvironment
	);

	return {
		modules,
		config,
	};
}
