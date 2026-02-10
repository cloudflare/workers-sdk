import assert from "node:assert";
import {
	APIError,
	experimental_patchConfig,
	experimental_readRawConfig,
	INHERIT_SYMBOL,
	PatchConfigError,
	UserError,
} from "@cloudflare/workers-utils";
import { convertCfWorkerInitBindingsToBindings } from "../api/startDevWorker/utils";
import { fetchResult } from "../cfetch";
import { createD1Database } from "../d1/create";
import { listDatabases } from "../d1/list";
import { getDatabaseInfoFromIdOrName } from "../d1/utils";
import { prompt, select } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
import { createKVNamespace, listKVNamespaces } from "../kv/helpers";
import { logger } from "../logger";
import * as metrics from "../metrics";
import {
	createR2Bucket,
	getR2Bucket,
	listR2Buckets,
} from "../r2/helpers/bucket";
import { printFlatBindings } from "../utils/print-bindings";
import { useServiceEnvironments } from "../utils/useServiceEnvironments";
import type { Binding, StartDevWorkerInput } from "../api/startDevWorker/types";
import type {
	CfD1Database,
	CfKvNamespace,
	CfR2Bucket,
	CfWorkerInit,
	ComplianceConfig,
	Config,
	RawConfig,
	WorkerMetadataBinding,
} from "@cloudflare/workers-utils";

export function getBindings(
	config: Config | undefined,
	options?: {
		pages?: boolean;
	}
): CfWorkerInit["bindings"] {
	return {
		kv_namespaces: config?.kv_namespaces,
		send_email: options?.pages ? undefined : config?.send_email,
		vars: config?.vars,
		wasm_modules: options?.pages ? undefined : config?.wasm_modules,
		browser: config?.browser,
		ai: config?.ai,
		images: config?.images,
		version_metadata: config?.version_metadata,
		text_blobs: options?.pages ? undefined : config?.text_blobs,
		data_blobs: options?.pages ? undefined : config?.data_blobs,
		durable_objects: config?.durable_objects,
		workflows: config?.workflows,
		queues: config?.queues.producers?.map((producer) => {
			return { binding: producer.binding, queue_name: producer.queue };
		}),
		r2_buckets: config?.r2_buckets,
		d1_databases: config?.d1_databases,
		vectorize: config?.vectorize,
		hyperdrive: config?.hyperdrive,
		secrets_store_secrets: config?.secrets_store_secrets,
		services: config?.services,
		analytics_engine_datasets: config?.analytics_engine_datasets,
		dispatch_namespaces: options?.pages
			? undefined
			: config?.dispatch_namespaces,
		mtls_certificates: config?.mtls_certificates,
		pipelines: options?.pages ? undefined : config?.pipelines,
		logfwdr: options?.pages ? undefined : config?.logfwdr,
		assets: options?.pages
			? undefined
			: config?.assets?.binding
				? { binding: config?.assets?.binding }
				: undefined,
		unsafe: options?.pages
			? undefined
			: {
					bindings: config?.unsafe.bindings,
					metadata: config?.unsafe.metadata,
					capnp: config?.unsafe.capnp,
				},
		unsafe_hello_world: options?.pages ? undefined : config?.unsafe_hello_world,
		ratelimits: config?.ratelimits,
		worker_loaders: config?.worker_loaders,
		vpc_services: config?.vpc_services,
		media: config?.media,
	};
}

export type Settings = {
	bindings: Array<WorkerMetadataBinding>;
};

abstract class ProvisionResourceHandler<
	T extends WorkerMetadataBinding["type"],
	B extends ProvisionableBinding,
> {
	constructor(
		public type: T,
		public bindingName: string,
		public binding: B,
		public idField: keyof B,
		public complianceConfig: ComplianceConfig,
		public accountId: string
	) {}

	// Does this resource already exist in the currently deployed version of the Worker?
	// If it does, that means we can inherit from it.
	abstract canInherit(
		settings: Settings | undefined
	): boolean | Promise<boolean>;

	inherit(): void {
		// @ts-expect-error idField is a key of this.binding
		this.binding[this.idField] = INHERIT_SYMBOL;
	}
	connect(id: string): void {
		// @ts-expect-error idField is a key of this.binding
		this.binding[this.idField] = id;
	}

	abstract create(name: string): Promise<string>;

	abstract get name(): string | undefined;

	async provision(name: string): Promise<void> {
		const id = await this.create(name);
		this.connect(id);
	}

	// This binding is fully specified and can't/shouldn't be provisioned
	// This is usually when it has an id (e.g. D1 `database_id`)
	isFullySpecified(): boolean {
		return false;
	}

	// Does this binding need to be provisioned?
	// Some bindings are not fully specified, but don't need provisioning
	// (e.g. R2 binding, with a bucket_name that already exists)
	async isConnectedToExistingResource(): Promise<boolean | string> {
		return false;
	}

	// Should this resource be provisioned?
	async shouldProvision(settings: Settings | undefined) {
		// If the resource is fully specified, don't provision
		if (!this.isFullySpecified()) {
			// If we can inherit, do that and don't provision
			if (await this.canInherit(settings)) {
				this.inherit();
			} else {
				// If the resource is connected to a remote resource that _exists_
				// (see comments on the individual functions for why this is different to isFullySpecified())
				const connected = await this.isConnectedToExistingResource();
				if (connected) {
					if (typeof connected === "string") {
						// Basically a special case for D1: the resource is specified by name in config
						// and exists, but needs to be specified by ID for the first deploy to work
						this.connect(connected);
					}
					return false;
				}
				return true;
			}
		}
		return false;
	}
}

class R2Handler extends ProvisionResourceHandler<
	"r2_bucket",
	Extract<Binding, { type: "r2_bucket" }>
> {
	get name(): string | undefined {
		return this.binding.bucket_name as string;
	}

	async create(name: string) {
		await createR2Bucket(
			this.complianceConfig,
			this.accountId,
			name,
			undefined,
			this.binding.jurisdiction
		);
		return name;
	}
	constructor(
		bindingName: string,
		binding: Extract<Binding, { type: "r2_bucket" }>,
		complianceConfig: ComplianceConfig,
		accountId: string
	) {
		super(
			"r2_bucket",
			bindingName,
			binding,
			"bucket_name",
			complianceConfig,
			accountId
		);
	}

	/**
	 * Inheriting an R2 binding replaces the id property (bucket_name for R2) with the inheritance symbol.
	 * This works when deploying (and is appropriate for all other binding types), but it means that the
	 * bucket_name for an R2 bucket is not displayed when deploying. As such, only use the inheritance symbol
	 * if the R2 binding has no `bucket_name`.
	 */
	override inherit(): void {
		this.binding.bucket_name ??= INHERIT_SYMBOL;
	}

	/**
	 * R2 bindings can be inherited if the binding name and jurisdiction match.
	 * Additionally, if the user has specified a bucket_name in config, make sure that matches
	 */
	canInherit(settings: Settings | undefined): boolean {
		return !!settings?.bindings.find(
			(existing) =>
				existing.type === this.type &&
				existing.name === this.bindingName &&
				existing.jurisdiction === this.binding.jurisdiction &&
				(this.binding.bucket_name
					? this.binding.bucket_name === existing.bucket_name
					: true)
		);
	}
	async isConnectedToExistingResource(): Promise<boolean> {
		assert(typeof this.binding.bucket_name !== "symbol");

		// If the user hasn't specified a bucket_name in config, we always provision
		if (!this.binding.bucket_name) {
			return false;
		}
		try {
			await getR2Bucket(
				this.complianceConfig,
				this.accountId,
				this.binding.bucket_name,
				this.binding.jurisdiction
			);
			// This bucket_name exists! We don't need to provision it
			return true;
		} catch (e) {
			if (!(e instanceof APIError && e.code === 10006)) {
				// this is an error that is not "bucket not found", so we do want to throw
				throw e;
			}

			// This bucket_name doesn't exist—let's provision
			return false;
		}
	}
}

class KVHandler extends ProvisionResourceHandler<
	"kv_namespace",
	Extract<Binding, { type: "kv_namespace" }>
> {
	get name(): string | undefined {
		return undefined;
	}
	async create(name: string) {
		return await createKVNamespace(this.complianceConfig, this.accountId, name);
	}
	constructor(
		bindingName: string,
		binding: Extract<Binding, { type: "kv_namespace" }>,
		complianceConfig: ComplianceConfig,
		accountId: string
	) {
		super(
			"kv_namespace",
			bindingName,
			binding,
			"id",
			complianceConfig,
			accountId
		);
	}
	canInherit(settings: Settings | undefined): boolean {
		return !!settings?.bindings.find(
			(existing) =>
				existing.type === this.type && existing.name === this.bindingName
		);
	}
	isFullySpecified(): boolean {
		return !!this.binding.id;
	}
}

class D1Handler extends ProvisionResourceHandler<
	"d1",
	Extract<Binding, { type: "d1" }>
> {
	get name(): string | undefined {
		return this.binding.database_name as string;
	}
	async create(name: string) {
		const db = await createD1Database(
			this.complianceConfig,
			this.accountId,
			name
		);
		return db.uuid;
	}
	constructor(
		bindingName: string,
		binding: Extract<Binding, { type: "d1" }>,
		complianceConfig: ComplianceConfig,
		accountId: string
	) {
		super(
			"d1",
			bindingName,
			binding,
			"database_id",
			complianceConfig,
			accountId
		);
	}
	async canInherit(settings: Settings | undefined): Promise<boolean> {
		const maybeInherited = settings?.bindings.find(
			(existing) =>
				existing.type === this.type && existing.name === this.bindingName
		) as Extract<WorkerMetadataBinding, { type: "d1" }> | undefined;
		// A D1 binding with the same binding name exists is already present on the worker...
		if (maybeInherited) {
			// ...and the user hasn't specified a name in their config, so we don't need to check if the database_name matches
			if (!this.binding.database_name) {
				return true;
			}

			// ...and the user HAS specified a name in their config, so we need to check if the database_name they provided
			// matches the database_name of the existing binding (which isn't present in settings, so we'll need to make an API call to check)
			const dbFromId = await getDatabaseInfoFromIdOrName(
				this.complianceConfig,
				this.accountId,
				maybeInherited.id
			);
			if (this.binding.database_name === dbFromId.name) {
				return true;
			}
		}
		return false;
	}
	async isConnectedToExistingResource(): Promise<boolean | string> {
		assert(typeof this.binding.database_name !== "symbol");

		// If the user hasn't specified a database_name in config, we always provision
		if (!this.binding.database_name) {
			return false;
		}
		try {
			const db = await getDatabaseInfoFromIdOrName(
				this.complianceConfig,
				this.accountId,
				this.binding.database_name
			);

			// This database_name exists! We don't need to provision it
			return db.uuid;
		} catch (e) {
			if (!(e instanceof APIError && e.code === 7404)) {
				// this is an error that is not "database not found", so we do want to throw
				throw e;
			}

			// This database_name doesn't exist—let's provision
			return false;
		}
	}
	isFullySpecified(): boolean {
		return !!this.binding.database_id;
	}
}

type ProvisionableBinding =
	| Extract<Binding, { type: "kv_namespace" }>
	| Extract<Binding, { type: "d1" }>
	| Extract<Binding, { type: "r2_bucket" }>;

const HANDLERS = {
	kv_namespace: {
		Handler: KVHandler,
		sort: 0,
		name: "KV Namespace",
		keyDescription: "title or id",
		configField: "kv_namespaces" as const,
		load: async (complianceConfig: ComplianceConfig, accountId: string) => {
			const preExistingKV = await listKVNamespaces(
				complianceConfig,
				accountId,
				true
			);
			return preExistingKV.map((ns) => ({ title: ns.title, value: ns.id }));
		},
		toConfig: (
			bindingName: string,
			binding: Extract<Binding, { type: "kv_namespace" }>
		): CfKvNamespace => {
			const { type: _, ...rest } = binding;
			return {
				...rest,
				binding: bindingName,
			};
		},
	},
	d1: {
		Handler: D1Handler,
		sort: 1,
		name: "D1 Database",
		keyDescription: "name or id",
		configField: "d1_databases" as const,
		load: async (complianceConfig: ComplianceConfig, accountId: string) => {
			const preExisting = await listDatabases(
				complianceConfig,
				accountId,
				true,
				1000
			);
			return preExisting.map((db) => ({ title: db.name, value: db.uuid }));
		},
		toConfig: (
			bindingName: string,
			binding: Extract<Binding, { type: "d1" }>
		): CfD1Database => {
			const { type: _, ...rest } = binding;
			return {
				...rest,
				binding: bindingName,
			};
		},
	},
	r2_bucket: {
		Handler: R2Handler,
		sort: 2,
		name: "R2 Bucket",
		keyDescription: "name",
		configField: "r2_buckets" as const,
		load: async (complianceConfig: ComplianceConfig, accountId: string) => {
			const preExisting = await listR2Buckets(complianceConfig, accountId);
			return preExisting.map((bucket) => ({
				title: bucket.name,
				value: bucket.name,
			}));
		},
		toConfig: (
			bindingName: string,
			binding: Extract<Binding, { type: "r2_bucket" }>
		): CfR2Bucket => {
			const { type: _, ...rest } = binding;
			return {
				...rest,
				binding: bindingName,
			};
		},
	},
};

type PendingResource = {
	binding: string;
	resourceType: "kv_namespace" | "d1" | "r2_bucket";
	handler: KVHandler | D1Handler | R2Handler;
};

function isProvisionableBinding(
	binding: Binding
): binding is ProvisionableBinding {
	return binding.type in HANDLERS;
}

function createHandler(
	bindingName: string,
	binding: ProvisionableBinding,
	complianceConfig: ComplianceConfig,
	accountId: string
): KVHandler | D1Handler | R2Handler {
	switch (binding.type) {
		case "kv_namespace":
			return new KVHandler(bindingName, binding, complianceConfig, accountId);
		case "d1":
			return new D1Handler(bindingName, binding, complianceConfig, accountId);
		case "r2_bucket":
			return new R2Handler(bindingName, binding, complianceConfig, accountId);
	}
}

function toConfigBinding(
	bindingName: string,
	binding: ProvisionableBinding
): CfKvNamespace | CfR2Bucket | CfD1Database {
	switch (binding.type) {
		case "kv_namespace":
			return HANDLERS.kv_namespace.toConfig(bindingName, binding);
		case "d1":
			return HANDLERS.d1.toConfig(bindingName, binding);
		case "r2_bucket":
			return HANDLERS.r2_bucket.toConfig(bindingName, binding);
	}
}

async function collectPendingResources(
	complianceConfig: ComplianceConfig,
	accountId: string,
	scriptName: string,
	bindings: StartDevWorkerInput["bindings"],
	requireRemote: boolean
): Promise<PendingResource[]> {
	let settings: Settings | undefined;

	try {
		settings = await getSettings(complianceConfig, accountId, scriptName);
	} catch {
		logger.debug("No settings found");
	}

	const pendingResources: PendingResource[] = [];

	for (const [bindingName, binding] of Object.entries(bindings ?? {})) {
		if (!isProvisionableBinding(binding)) {
			continue;
		}

		if (requireRemote && !("remote" in binding && binding.remote)) {
			continue;
		}

		const h = createHandler(bindingName, binding, complianceConfig, accountId);

		if (await h.shouldProvision(settings)) {
			pendingResources.push({
				binding: bindingName,
				resourceType: binding.type,
				handler: h,
			});
		}
	}

	return pendingResources.sort(
		(a, b) => HANDLERS[a.resourceType].sort - HANDLERS[b.resourceType].sort
	);
}

export async function provisionBindingsFromInput(
	bindings: StartDevWorkerInput["bindings"],
	accountId: string,
	scriptName: string,
	autoCreate: boolean,
	config: Config,
	requireRemote = false
): Promise<void> {
	const configPath = config.userConfigPath ?? config.configPath;
	const pendingResources = await collectPendingResources(
		config,
		accountId,
		scriptName,
		bindings,
		requireRemote
	);

	if (pendingResources.length > 0) {
		assert(
			configPath,
			"Provisioning resources is not possible without a config file"
		);

		if (useServiceEnvironments(config)) {
			throw new UserError(
				"Provisioning resources is not supported with a service environment"
			);
		}
		logger.log();

		printFlatBindings(
			Object.fromEntries(
				pendingResources.map((r) => [r.binding, { type: r.resourceType }])
			),
			config.tail_consumers,
			config.streaming_tail_consumers,
			config.containers,
			{ provisioning: true }
		);
		logger.log();

		const existingResources: Record<string, NormalisedResourceInfo[]> = {};

		for (const resource of pendingResources) {
			existingResources[resource.resourceType] ??= await HANDLERS[
				resource.resourceType
			].load(config, accountId);

			await runProvisioningFlow(
				resource,
				existingResources[resource.resourceType],
				HANDLERS[resource.resourceType].name,
				scriptName,
				autoCreate
			);
		}

		const patch: RawConfig = {};

		const existingBindingNames = new Set<string>();

		const isUsingRedirectedConfig =
			config.userConfigPath && config.userConfigPath !== config.configPath;

		// If we're using a redirected config, then the redirected config potentially has injected
		// bindings that weren't originally in the user config. These can be provisioned, but we
		// should not write the IDs back to the user config file (because the bindings weren't there in the first place)
		if (isUsingRedirectedConfig) {
			const { rawConfig: unredirectedConfig } =
				await experimental_readRawConfig(
					{ config: config.userConfigPath },
					{ useRedirectIfAvailable: false }
				);
			for (const resourceType of Object.keys(
				HANDLERS
			) as (keyof typeof HANDLERS)[]) {
				const configField = HANDLERS[resourceType].configField;
				for (const binding of unredirectedConfig[configField] ?? []) {
					existingBindingNames.add(binding.binding);
				}
			}
		}

		for (const [bindingName, binding] of Object.entries(bindings ?? {})) {
			if (!isProvisionableBinding(binding)) {
				continue;
			}

			// See above for why we skip writing back some bindings to the config file
			if (isUsingRedirectedConfig && !existingBindingNames.has(bindingName)) {
				continue;
			}

			const resourceType = HANDLERS[binding.type].configField;

			patch[resourceType] ??= [];

			const bindingToWrite = toConfigBinding(bindingName, binding);

			patch[resourceType].push(
				Object.fromEntries(
					Object.entries(bindingToWrite).filter(
						// Make sure all the values are JSON serialisable.
						// Otherwise we end up with "undefined" in the config
						([_, value]) => typeof value === "string"
					)
				) as NonNullable<(typeof patch)[typeof resourceType]>[number]
			);
		}

		// If the user is performing an interactive deploy, write the provisioned IDs back to the config file.
		// This is not necessary, as future deploys can use inherited resources, but it can help with
		// portability of the config file, and adds robustness to bindings being renamed.
		if (!isNonInteractiveOrCI()) {
			try {
				await experimental_patchConfig(configPath, patch, false);
				logger.log(
					"Your Worker was deployed with provisioned resources. We've written the IDs of these resources to your config file, which you can choose to save or discard. Either way future deploys will continue to work."
				);
			} catch (e) {
				// no-op — if the user is using TOML config we can't update it.
				if (!(e instanceof PatchConfigError)) {
					throw e;
				}
			}
		}

		const resourceCount = pendingResources.reduce(
			(acc, resource) => {
				acc[resource.resourceType] ??= 0;
				acc[resource.resourceType]++;
				return acc;
			},
			{} as Record<string, number>
		);
		logger.log(`🎉 All resources provisioned, continuing with deployment...\n`);

		metrics.sendMetricsEvent("provision resources", resourceCount, {
			sendMetrics: config.send_metrics,
		});
	}
}

/**
 * Provision bindings from the legacy CfWorkerInit format.
 * This is a wrapper around provisionBindingsFromInput that converts the input format
 * and writes the provisioned IDs back to the original bindings.
 *
 * @deprecated Use {@link provisionBindingsFromInput} instead with the flat bindings format.
 */
export async function provisionBindings(
	bindings: CfWorkerInit["bindings"],
	accountId: string,
	scriptName: string,
	autoCreate: boolean,
	config: Config,
	requireRemote = false
): Promise<void> {
	const convertedBindings = convertCfWorkerInitBindingsToBindings(bindings);
	await provisionBindingsFromInput(
		convertedBindings,
		accountId,
		scriptName,
		autoCreate,
		config,
		requireRemote
	);

	// Write provisioned IDs back to the original bindings
	// (provisionBindingsFromInput mutated convertedBindings in place)
	for (const [bindingName, binding] of Object.entries(
		convertedBindings ?? {}
	)) {
		if (binding.type === "kv_namespace") {
			const original = bindings.kv_namespaces?.find(
				(b) => b.binding === bindingName
			);
			if (original && binding.id) {
				original.id = binding.id;
			}
		} else if (binding.type === "d1") {
			const original = bindings.d1_databases?.find(
				(b) => b.binding === bindingName
			);
			if (original && binding.database_id) {
				original.database_id = binding.database_id;
			}
		} else if (binding.type === "r2_bucket") {
			const original = bindings.r2_buckets?.find(
				(b) => b.binding === bindingName
			);
			if (original && binding.bucket_name) {
				original.bucket_name = binding.bucket_name;
			}
		}
	}
}

export function getSettings(
	complianceConfig: ComplianceConfig,
	accountId: string,
	scriptName: string
) {
	return fetchResult<Settings>(
		complianceConfig,
		`/accounts/${accountId}/workers/scripts/${scriptName}/settings`
	);
}

function printDivider() {
	logger.log();
}

type NormalisedResourceInfo = {
	/** The name of the resource */
	title: string;
	/** The id of the resource */
	value: string;
};

async function runProvisioningFlow(
	item: PendingResource,
	preExisting: NormalisedResourceInfo[],
	friendlyBindingName: string,
	scriptName: string,
	autoCreate: boolean
) {
	const NEW_OPTION_VALUE = "__WRANGLER_INTERNAL_NEW";
	const SEARCH_OPTION_VALUE = "__WRANGLER_INTERNAL_SEARCH";
	const MAX_OPTIONS = 4;
	// NB preExisting does not actually contain all resources on the account - we max out at ~30 d1 databases, ~100 kv, and ~20 r2.
	const options = preExisting.slice(0, MAX_OPTIONS - 1);
	if (options.length < preExisting.length) {
		options.push({
			title: "Other (too many to list)",
			value: SEARCH_OPTION_VALUE,
		});
	}

	const defaultName = `${scriptName}-${item.binding.toLowerCase().replaceAll("_", "-")}`;
	logger.log("Provisioning", item.binding, `(${friendlyBindingName})...`);

	if (item.handler.name) {
		logger.log("Resource name found in config:", item.handler.name);
		logger.log(
			`🌀 Creating new ${friendlyBindingName} "${item.handler.name}"...`
		);
		await item.handler.provision(item.handler.name);
	} else if (autoCreate) {
		logger.log(`🌀 Creating new ${friendlyBindingName} "${defaultName}"...`);
		await item.handler.provision(defaultName);
	} else {
		let action: string = NEW_OPTION_VALUE;

		if (options.length > 0) {
			action = await select(
				`Would you like to connect an existing ${friendlyBindingName} or create a new one?`,
				{
					choices: options.concat([
						{ title: "Create new", value: NEW_OPTION_VALUE },
					]),
					defaultOption: options.length,
					fallbackOption: options.length,
				}
			);
		}

		if (action === NEW_OPTION_VALUE) {
			const name = await prompt(
				`Enter a name for your new ${friendlyBindingName}`,
				{
					defaultValue: defaultName,
				}
			);
			logger.log(`🌀 Creating new ${friendlyBindingName} "${name}"...`);
			await item.handler.provision(name);
		} else if (action === SEARCH_OPTION_VALUE) {
			// search through pre-existing resources that weren't listed
			let foundResource: NormalisedResourceInfo | undefined;
			while (foundResource === undefined) {
				const input = await prompt(
					`Enter the ${HANDLERS[item.resourceType].keyDescription} for an existing ${friendlyBindingName}`
				);
				foundResource = preExisting.find(
					(r) => r.title === input || r.value === input
				);
				if (foundResource) {
					item.handler.connect(foundResource.value);
				} else {
					logger.log(
						`No ${friendlyBindingName} with that ${HANDLERS[item.resourceType].keyDescription} "${input}" found. Please try again.`
					);
				}
			}
		} else {
			item.handler.connect(action);
		}
	}

	logger.log(`✨ ${item.binding} provisioned 🎉`);
	printDivider();
}
