import assert from "node:assert";
import {
	APIError,
	experimental_patchConfig,
	experimental_readRawConfig,
	INHERIT_SYMBOL,
	PatchConfigError,
	UserError,
} from "@cloudflare/workers-utils";
import {
	fetchResult,
	isNonInteractiveOrCI,
	logger,
	prompt,
	select,
} from "../../shared/context";
import { printBindings } from "./print-bindings";
import { useServiceEnvironments } from "./use-service-environments";
import type {
	Binding,
	CfAgentMemory,
	CfAISearchNamespace,
	CfD1Database,
	CfKvNamespace,
	CfR2Bucket,
	ComplianceConfig,
	Config,
	RawConfig,
	WorkerMetadataBinding,
} from "@cloudflare/workers-utils";

export type Settings = {
	bindings: Array<WorkerMetadataBinding>;
};

type DatabaseCreationResult = {
	uuid: string;
	name: string;
};

type ConcreteDatabase = {
	uuid: string;
	name: string;
};

type DatabaseInfo = {
	uuid: string;
	name: string;
};

type R2BucketInfo = {
	name: string;
	creation_date: string;
	location?: string;
	storage_class?: string;
};

type AISearchNamespace = {
	name: string;
};

type AgentMemoryNamespace = {
	id: string;
	name: string;
	account_id: string;
	created_at: string;
	updated_at: string;
};

type KVNamespaceInfo = {
	id: string;
	title: string;
	supports_url_encoding?: boolean;
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

	isFullySpecified(): boolean {
		return false;
	}

	async isConnectedToExistingResource(): Promise<boolean | string> {
		return false;
	}

	async shouldProvision(settings: Settings | undefined) {
		if (!this.isFullySpecified()) {
			if (await this.canInherit(settings)) {
				this.inherit();
			} else {
				const connected = await this.isConnectedToExistingResource();
				if (connected) {
					if (typeof connected === "string") {
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

	override inherit(): void {
		this.binding.bucket_name ??= INHERIT_SYMBOL;
	}

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
			return true;
		} catch (e) {
			if (!(e instanceof APIError && e.code === 10006)) {
				throw e;
			}

			return false;
		}
	}
}

class AISearchNamespaceHandler extends ProvisionResourceHandler<
	"ai_search_namespace",
	Extract<Binding, { type: "ai_search_namespace" }>
> {
	get name(): string | undefined {
		return this.binding.namespace as string;
	}

	async create(name: string) {
		await createAISearchNamespace(this.complianceConfig, this.accountId, name);
		return name;
	}

	constructor(
		bindingName: string,
		binding: Extract<Binding, { type: "ai_search_namespace" }>,
		complianceConfig: ComplianceConfig,
		accountId: string
	) {
		super(
			"ai_search_namespace",
			bindingName,
			binding,
			"namespace",
			complianceConfig,
			accountId
		);
	}

	canInherit(settings: Settings | undefined): boolean {
		return !!settings?.bindings.find(
			(existing) =>
				existing.type === this.type &&
				existing.name === this.bindingName &&
				(this.binding.namespace
					? this.binding.namespace === existing.namespace
					: true)
		);
	}

	async isConnectedToExistingResource(): Promise<boolean> {
		assert(typeof this.binding.namespace !== "symbol");

		if (!this.binding.namespace) {
			return false;
		}

		const namespace = await getAISearchNamespace(
			this.complianceConfig,
			this.accountId,
			this.binding.namespace
		);

		return namespace !== null;
	}
}

class AgentMemoryNamespaceHandler extends ProvisionResourceHandler<
	"agent_memory",
	Extract<Binding, { type: "agent_memory" }>
> {
	get name(): string | undefined {
		return this.binding.namespace as string;
	}

	async create(name: string) {
		await createAgentMemoryNamespace(
			this.complianceConfig,
			this.accountId,
			name
		);
		return name;
	}

	constructor(
		bindingName: string,
		binding: Extract<Binding, { type: "agent_memory" }>,
		complianceConfig: ComplianceConfig,
		accountId: string
	) {
		super(
			"agent_memory",
			bindingName,
			binding,
			"namespace",
			complianceConfig,
			accountId
		);
	}

	canInherit(settings: Settings | undefined): boolean {
		return !!settings?.bindings.find(
			(existing) =>
				existing.type === this.type &&
				existing.name === this.bindingName &&
				(this.binding.namespace
					? this.binding.namespace === existing.namespace
					: true)
		);
	}

	async isConnectedToExistingResource(): Promise<boolean> {
		assert(typeof this.binding.namespace !== "symbol");

		if (!this.binding.namespace) {
			return false;
		}

		const namespace = await getAgentMemoryNamespace(
			this.complianceConfig,
			this.accountId,
			this.binding.namespace
		);

		return namespace !== null;
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
		if (maybeInherited) {
			if (!this.binding.database_name) {
				return true;
			}

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

		if (!this.binding.database_name) {
			return false;
		}
		try {
			const db = await getDatabaseInfoFromIdOrName(
				this.complianceConfig,
				this.accountId,
				this.binding.database_name
			);

			return db.uuid;
		} catch (e) {
			if (!(e instanceof APIError && e.code === 7404)) {
				throw e;
			}

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
	| Extract<Binding, { type: "r2_bucket" }>
	| Extract<Binding, { type: "ai_search_namespace" }>
	| Extract<Binding, { type: "agent_memory" }>;

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
	ai_search_namespace: {
		Handler: AISearchNamespaceHandler,
		sort: 3,
		name: "AI Search Namespace",
		keyDescription: "namespace name",
		configField: "ai_search_namespaces" as const,
		load: async (_complianceConfig: ComplianceConfig, _accountId: string) => {
			return [];
		},
		toConfig: (
			bindingName: string,
			binding: Extract<Binding, { type: "ai_search_namespace" }>
		): CfAISearchNamespace => {
			const { type: _, ...rest } = binding;
			return {
				...rest,
				binding: bindingName,
			};
		},
	},
	agent_memory: {
		Handler: AgentMemoryNamespaceHandler,
		sort: 4,
		name: "Agent Memory",
		keyDescription: "namespace name",
		configField: "agent_memory" as const,
		load: async (_complianceConfig: ComplianceConfig, _accountId: string) => {
			return [];
		},
		toConfig: (
			bindingName: string,
			binding: Extract<Binding, { type: "agent_memory" }>
		): CfAgentMemory => {
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
	resourceType:
		| "kv_namespace"
		| "d1"
		| "r2_bucket"
		| "ai_search_namespace"
		| "agent_memory";
	handler:
		| KVHandler
		| D1Handler
		| R2Handler
		| AISearchNamespaceHandler
		| AgentMemoryNamespaceHandler;
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
):
	| KVHandler
	| D1Handler
	| R2Handler
	| AISearchNamespaceHandler
	| AgentMemoryNamespaceHandler {
	switch (binding.type) {
		case "kv_namespace":
			return new KVHandler(bindingName, binding, complianceConfig, accountId);
		case "d1":
			return new D1Handler(bindingName, binding, complianceConfig, accountId);
		case "r2_bucket":
			return new R2Handler(bindingName, binding, complianceConfig, accountId);
		case "ai_search_namespace":
			return new AISearchNamespaceHandler(
				bindingName,
				binding,
				complianceConfig,
				accountId
			);
		case "agent_memory":
			return new AgentMemoryNamespaceHandler(
				bindingName,
				binding,
				complianceConfig,
				accountId
			);
	}
}

function toConfigBinding(
	bindingName: string,
	binding: ProvisionableBinding
):
	| CfKvNamespace
	| CfR2Bucket
	| CfD1Database
	| CfAISearchNamespace
	| CfAgentMemory {
	switch (binding.type) {
		case "kv_namespace":
			return HANDLERS.kv_namespace.toConfig(bindingName, binding);
		case "d1":
			return HANDLERS.d1.toConfig(bindingName, binding);
		case "r2_bucket":
			return HANDLERS.r2_bucket.toConfig(bindingName, binding);
		case "ai_search_namespace":
			return HANDLERS.ai_search_namespace.toConfig(bindingName, binding);
		case "agent_memory":
			return HANDLERS.agent_memory.toConfig(bindingName, binding);
	}
}

async function collectPendingResources(
	complianceConfig: ComplianceConfig,
	accountId: string,
	scriptName: string,
	bindings: Record<string, Binding>,
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

		const handler = createHandler(
			bindingName,
			binding,
			complianceConfig,
			accountId
		);

		if (await handler.shouldProvision(settings)) {
			pendingResources.push({
				binding: bindingName,
				resourceType: binding.type,
				handler,
			});
		}
	}

	return pendingResources.sort(
		(a, b) => HANDLERS[a.resourceType].sort - HANDLERS[b.resourceType].sort
	);
}

export async function provisionBindings(
	bindings: Record<string, Binding>,
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
				"Provisioning resources is not supported with a service environment",
				{ telemetryMessage: "provision resources with service environment" }
			);
		}
		logger.log();

		printBindings(
			Object.fromEntries(
				pendingResources.map((resource) => [
					resource.binding,
					{ type: resource.resourceType },
				])
			) as Record<string, Binding>,
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

			if (isUsingRedirectedConfig && !existingBindingNames.has(bindingName)) {
				continue;
			}

			const resourceType = HANDLERS[binding.type].configField;

			patch[resourceType] ??= [];

			const bindingToWrite = toConfigBinding(bindingName, binding);

			(patch[resourceType] as unknown as Array<Record<string, string>>).push(
				Object.fromEntries(
					Object.entries(bindingToWrite).filter(
						([_, value]) => typeof value === "string"
					)
				)
			);
		}

		if (!isNonInteractiveOrCI()) {
			try {
				await experimental_patchConfig(configPath, patch, false);
				logger.log(
					"Your Worker was deployed with provisioned resources. We've written the IDs of these resources to your config file, which you can choose to save or discard. Either way future deploys will continue to work."
				);
			} catch (e) {
				if (!(e instanceof PatchConfigError)) {
					throw e;
				}
			}
		}

		logger.log(`🎉 All resources provisioned, continuing with deployment...\n`);
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
	title: string;
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
	const options = preExisting.slice(0, MAX_OPTIONS - 1);
	if (options.length < preExisting.length) {
		options.push({
			title: "Other (too many to list)",
			value: SEARCH_OPTION_VALUE,
		});
	}

	const defaultName = autoProvisionedResourceName(scriptName, item.binding);
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
			let foundResource: NormalisedResourceInfo | undefined;
			while (foundResource === undefined) {
				const input = await prompt(
					`Enter the ${HANDLERS[item.resourceType].keyDescription} for an existing ${friendlyBindingName}`
				);
				foundResource = preExisting.find(
					(resource) => resource.title === input || resource.value === input
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

function autoProvisionedResourceName(
	scriptName: string,
	bindingName: string
): string {
	return `${scriptName}-${bindingName.toLowerCase().replaceAll("_", "-")}`;
}

async function createKVNamespace(
	complianceConfig: ComplianceConfig,
	accountId: string,
	title: string
): Promise<string> {
	const response = await fetchResult<{ id: string }>(
		complianceConfig,
		`/accounts/${accountId}/storage/kv/namespaces`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				title,
			}),
		}
	);

	return response.id;
}

async function listKVNamespaces(
	complianceConfig: ComplianceConfig,
	accountId: string,
	limitCalls = false
): Promise<KVNamespaceInfo[]> {
	const pageSize = 100;
	let page = 1;
	const results: KVNamespaceInfo[] = [];
	while (results.length % pageSize === 0) {
		const json = await fetchResult<KVNamespaceInfo[]>(
			complianceConfig,
			`/accounts/${accountId}/storage/kv/namespaces`,
			{},
			new URLSearchParams({
				per_page: pageSize.toString(),
				order: "title",
				direction: "asc",
				page: page.toString(),
			})
		);
		page++;
		results.push(...json);
		if (limitCalls) {
			break;
		}
		if (json.length < pageSize) {
			break;
		}
	}
	return results;
}

async function createD1Database(
	complianceConfig: ComplianceConfig,
	accountId: string,
	name: string
) {
	try {
		return await fetchResult<DatabaseCreationResult>(
			complianceConfig,
			`/accounts/${accountId}/d1/database`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ name }),
			}
		);
	} catch (e) {
		const errorCode = (e as { code: number }).code;

		if (errorCode === 7502) {
			throw new UserError("A database with that name already exists", {
				telemetryMessage: "d1 create database already exists",
			});
		}

		if (errorCode === 7406) {
			throw new UserError(
				"You have reached the maximum number of D1 databases for your account. Please consider deleting unused databases, or visit the D1 documentation to learn more: https://developers.cloudflare.com/d1/",
				{ telemetryMessage: "d1 create database limit reached" }
			);
		}

		throw e;
	}
}

async function listDatabases(
	complianceConfig: ComplianceConfig,
	accountId: string,
	limitCalls = false,
	pageSize = 10
): Promise<Array<ConcreteDatabase>> {
	let page = 1;
	const results = [];
	while (results.length % pageSize === 0) {
		const json: Array<ConcreteDatabase> = await fetchResult(
			complianceConfig,
			`/accounts/${accountId}/d1/database`,
			{},
			new URLSearchParams({
				per_page: pageSize.toString(),
				page: page.toString(),
			})
		);
		page++;
		results.push(...json);
		if (limitCalls && page > 3) {
			break;
		}
		if (json.length < pageSize) {
			break;
		}
	}
	return results;
}

async function getDatabaseInfoFromIdOrName(
	complianceConfig: ComplianceConfig,
	accountId: string,
	databaseIdOrName: string
): Promise<DatabaseInfo> {
	return await fetchResult<DatabaseInfo>(
		complianceConfig,
		`/accounts/${accountId}/d1/database/${databaseIdOrName}`,
		{
			headers: {
				"Content-Type": "application/json",
			},
		}
	);
}

async function listR2Buckets(
	complianceConfig: ComplianceConfig,
	accountId: string,
	jurisdiction?: string
): Promise<R2BucketInfo[]> {
	const headers: Record<string, string> = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	const results = await fetchResult<{
		buckets: R2BucketInfo[];
	}>(complianceConfig, `/accounts/${accountId}/r2/buckets`, { headers });
	return results.buckets;
}

async function getR2Bucket(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	jurisdiction?: string
): Promise<R2BucketInfo> {
	const headers: Record<string, string> = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	return await fetchResult<R2BucketInfo>(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}`,
		{
			method: "GET",
			headers,
		}
	);
}

async function createR2Bucket(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	location?: string,
	jurisdiction?: string,
	storageClass?: string
): Promise<void> {
	const headers: Record<string, string> = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	return await fetchResult<void>(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets`,
		{
			method: "POST",
			body: JSON.stringify({
				name: bucketName,
				...(storageClass !== undefined && { storageClass }),
				...(location !== undefined && { locationHint: location }),
			}),
			headers,
		}
	);
}

async function getAISearchNamespace(
	complianceConfig: ComplianceConfig,
	accountId: string,
	namespaceName: string
): Promise<AISearchNamespace | null> {
	try {
		return await fetchResult<AISearchNamespace>(
			complianceConfig,
			`/accounts/${accountId}/ai-search/namespaces/${namespaceName}`,
			{ method: "GET" }
		);
	} catch (e) {
		if (e instanceof APIError && e.status === 404) {
			return null;
		}
		throw e;
	}
}

async function createAISearchNamespace(
	complianceConfig: ComplianceConfig,
	accountId: string,
	namespaceName: string
): Promise<void> {
	await fetchResult<void>(
		complianceConfig,
		`/accounts/${accountId}/ai-search/namespaces`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: namespaceName }),
		}
	);
}

async function getAgentMemoryNamespace(
	complianceConfig: ComplianceConfig,
	accountId: string,
	namespaceName: string
): Promise<AgentMemoryNamespace | null> {
	try {
		return await fetchResult<AgentMemoryNamespace>(
			complianceConfig,
			`/accounts/${accountId}/agent-memory/namespaces/${namespaceName}`
		);
	} catch (e) {
		if (e instanceof APIError && e.status === 404) {
			return null;
		}
		throw e;
	}
}

async function createAgentMemoryNamespace(
	complianceConfig: ComplianceConfig,
	accountId: string,
	namespaceName: string
): Promise<void> {
	await fetchResult<AgentMemoryNamespace>(
		complianceConfig,
		`/accounts/${accountId}/agent-memory/namespaces`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: namespaceName }),
		}
	);
}
