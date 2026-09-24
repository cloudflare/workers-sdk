import {
	CONFIGURATION_DOCS_URL,
	DURABLE_OBJECT_EXPORTS_DOCS_URL,
	ENVIRONMENTS_DOCS_URL,
	PREVIEWS_DOCS_URL,
	SECRETS_DOCS_URL,
	createFollowUp,
	deduplicateFollowUps,
	followUpToComment,
} from "./follow-ups";
import type {
	ConvertedBranch,
	ConvertedWranglerConfig,
	MigrationBundler,
	MigrationFollowUp,
	OutputCall,
	OutputComment,
	OutputObject,
	OutputProperty,
	OutputValue,
} from "./types";
import type { RawConfig } from "@cloudflare/workers-utils";

type UnknownRecord = Record<string, unknown>;

const NON_INHERITABLE_FIELDS = new Set([
	"agent_memory",
	"ai_search_namespaces",
	"ai_search",
	"ai",
	"analytics_engine_datasets",
	"artifacts",
	"browser",
	"cloudchamber",
	"connect",
	"containers",
	"d1_databases",
	"define",
	"dispatch_namespaces",
	"durable_objects",
	"flagship",
	"hyperdrive",
	"images",
	"kv_namespaces",
	"logfwdr",
	"media",
	"mtls_certificates",
	"pipelines",
	"queues",
	"r2_buckets",
	"ratelimits",
	"secrets_store_secrets",
	"secrets",
	"send_email",
	"services",
	"stream",
	"streaming_tail_consumers",
	"tail_consumers",
	"unsafe_hello_world",
	"unsafe",
	"vars",
	"vectorize",
	"version_metadata",
	"vpc_networks",
	"vpc_services",
	"worker_loaders",
	"workflows",
]);

const TOOLING_FIELDS = new Set([
	"alias",
	"base_dir",
	"build",
	"data_blobs",
	"define",
	"dev",
	"find_additional_modules",
	"jsx_factory",
	"jsx_fragment",
	"keep_names",
	"minify",
	"no_bundle",
	"preserve_file_names",
	"python_modules",
	"rules",
	"send_metrics",
	"text_blobs",
	"tsconfig",
	"upload_source_maps",
	"wasm_modules",
]);

export const KNOWN_FIELDS = new Set([
	"$schema",
	"access",
	"account_id",
	"addresses",
	"agent_memory",
	"ai_search_namespaces",
	"ai_search",
	"ai",
	"alias",
	"analytics_engine_datasets",
	"artifacts",
	"assets",
	"base_dir",
	"browser",
	"build",
	"cache",
	"cloudchamber",
	"compatibility_date",
	"compatibility_flags",
	"compliance_region",
	"connect",
	"containers",
	"d1_databases",
	"data_blobs",
	"define",
	"dependencies_instrumentation",
	"dev",
	"dispatch_namespaces",
	"durable_objects",
	"env",
	"exports",
	"find_additional_modules",
	"first_party_worker",
	"flagship",
	"hyperdrive",
	"images",
	"jsx_factory",
	"jsx_fragment",
	"keep_names",
	"keep_vars",
	"kv_namespaces",
	"limits",
	"logfwdr",
	"logpush",
	"main",
	"media",
	"migrations",
	"minify",
	"mtls_certificates",
	"name",
	"no_bundle",
	"observability",
	"pages_build_output_dir",
	"pipelines",
	"placement",
	"preserve_file_names",
	"preview_urls",
	"previews",
	"python_modules",
	"queues",
	"r2_buckets",
	"ratelimits",
	"route",
	"routes",
	"rules",
	"secrets_store_secrets",
	"secrets",
	"send_email",
	"send_metrics",
	"services",
	"site",
	"stream",
	"streaming_tail_consumers",
	"tail_consumers",
	"text_blobs",
	"triggers",
	"tsconfig",
	"unsafe_hello_world",
	"unsafe",
	"upload_source_maps",
	"vars",
	"vectorize",
	"version_metadata",
	"vpc_networks",
	"vpc_services",
	"wasm_modules",
	"worker_loaders",
	"workers_dev",
	"workflows",
]);

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: UnknownRecord, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(record, key);
}

function getRecord(
	record: UnknownRecord,
	key: string
): UnknownRecord | undefined {
	const value = record[key];
	return isRecord(value) ? value : undefined;
}

function getRecords(record: UnknownRecord, key: string): UnknownRecord[] {
	const value = record[key];
	return Array.isArray(value) ? value.filter(isRecord) : [];
}

function getStrings(record: UnknownRecord, key: string): string[] {
	const value = record[key];
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
}

function toOutputValue(value: unknown): OutputValue | undefined {
	if (
		value === null ||
		typeof value === "boolean" ||
		typeof value === "number" ||
		typeof value === "string"
	) {
		return value;
	}

	if (Array.isArray(value)) {
		const entries: OutputValue[] = [];
		for (const entry of value) {
			const converted = toOutputValue(entry);
			if (converted !== undefined) {
				entries.push(converted);
			}
		}

		return entries;
	}

	if (isRecord(value)) {
		return objectFromRecord(value);
	}

	return undefined;
}

function objectFromRecord(
	record: UnknownRecord,
	transformKey: (key: string) => string = (key) => key
): OutputObject {
	const properties: OutputProperty[] = [];
	for (const [key, value] of Object.entries(record)) {
		const converted = toOutputValue(value);
		if (converted !== undefined) {
			properties.push({ key: transformKey(key), value: converted });
		}
	}

	return {
		kind: "object",
		properties,
	};
}

function snakeToCamel(value: string): string {
	return value.replace(/_([a-z])/g, (_, letter: string) =>
		letter.toUpperCase()
	);
}

function camelObject(record: UnknownRecord): OutputObject {
	const properties: OutputProperty[] = [];
	for (const [key, value] of Object.entries(record)) {
		let converted: OutputValue | undefined;
		if (isRecord(value)) {
			converted = camelObject(value);
		} else if (Array.isArray(value)) {
			converted = value
				.map((entry) =>
					isRecord(entry) ? camelObject(entry) : toOutputValue(entry)
				)
				.filter((entry): entry is OutputValue => entry !== undefined);
		} else {
			converted = toOutputValue(value);
		}

		if (converted !== undefined) {
			properties.push({ key: snakeToCamel(key), value: converted });
		}
	}

	return {
		kind: "object",
		properties,
	};
}

function call(callee: string, ...args: OutputValue[]): OutputCall {
	return {
		args,
		callee,
		kind: "call",
	};
}

function optionsFromRecord(
	record: UnknownRecord,
	mappings: ReadonlyArray<readonly [string, string]>,
	includeRemote = false
): OutputObject {
	const properties: OutputProperty[] = [];
	for (const [sourceKey, targetKey] of mappings) {
		const value = toOutputValue(record[sourceKey]);
		if (value !== undefined) {
			properties.push({
				key: targetKey,
				value,
			});
		}
	}

	if (includeRemote && typeof record.remote === "boolean") {
		properties.push({
			key: "dev",
			value: {
				kind: "object",
				properties: [
					{
						key: "remote",
						value: record.remote,
					},
				],
			},
		});
	}

	return {
		kind: "object",
		properties,
	};
}

function createBranchSource(
	base: UnknownRecord,
	overrides: UnknownRecord,
	environmentName?: string
): UnknownRecord {
	const merged: UnknownRecord = { ...base };
	delete merged.env;

	if (environmentName !== undefined) {
		for (const field of NON_INHERITABLE_FIELDS) {
			delete merged[field];
		}
	}

	Object.assign(merged, overrides);

	if (
		environmentName !== undefined &&
		typeof overrides.name !== "string" &&
		typeof base.name === "string"
	) {
		merged.name = `${base.name}-${environmentName}`;
	}

	return merged;
}

function createPreviewSource(
	base: UnknownRecord,
	overrides: UnknownRecord
): UnknownRecord {
	const merged = createBranchSource(base, {});

	for (const field of NON_INHERITABLE_FIELDS) {
		delete merged[field];
	}

	Object.assign(merged, overrides);
	delete merged.previews;

	return merged;
}

function addUnknownFieldFollowUps(
	record: UnknownRecord,
	sourcePrefix: string,
	followUps: MigrationFollowUp[]
): void {
	for (const field of Object.keys(record)) {
		if (KNOWN_FIELDS.has(field)) {
			continue;
		}

		followUps.push(
			createFollowUp(
				"unsupported-field",
				`The Wrangler field \`${field}\` is not supported by the new config and was not migrated.`,
				{
					docsUrl: CONFIGURATION_DOCS_URL,
					sourcePath: sourcePrefix ? `${sourcePrefix}.${field}` : field,
				}
			)
		);
	}
}

function addProperty(
	properties: OutputProperty[],
	source: UnknownRecord,
	sourceKey: string,
	targetKey: string = sourceKey,
	transform: (value: unknown) => OutputValue | undefined = toOutputValue
): void {
	if (!hasOwn(source, sourceKey)) {
		return;
	}

	const value = transform(source[sourceKey]);
	if (value !== undefined) {
		properties.push({ key: targetKey, value });
	}
}

function addBinding(
	bindings: Map<string, OutputValue>,
	name: unknown,
	value: OutputValue,
	sourcePath: string,
	report: (followUp: MigrationFollowUp) => void
): void {
	if (typeof name !== "string" || name.length === 0) {
		report(
			createFollowUp(
				"invalid-binding",
				`A binding at \`${sourcePath}\` has no valid binding name and was not migrated.`,
				{ sourcePath }
			)
		);
		return;
	}

	if (bindings.has(name)) {
		report(
			createFollowUp(
				"binding-name-collision",
				`Multiple Wrangler bindings use the name \`${name}\`. Resolve the collision manually.`,
				{ sourcePath }
			)
		);
		return;
	}

	bindings.set(name, value);
}

function reportUnsupportedOptions(
	record: UnknownRecord,
	keys: string[],
	sourcePath: string,
	report: (followUp: MigrationFollowUp) => void
): void {
	const present = keys.filter((key) => hasOwn(record, key));
	if (present.length === 0) {
		return;
	}

	report(
		createFollowUp(
			"unsupported-binding-options",
			`The options ${present.map((key) => `\`${key}\``).join(", ")} at \`${sourcePath}\` require manual migration.`,
			{ sourcePath }
		)
	);
}

function convertBindings(
	source: UnknownRecord,
	sourcePrefix: string,
	imports: Set<string>,
	report: (followUp: MigrationFollowUp) => void
): OutputObject | undefined {
	const bindings = new Map<string, OutputValue>();
	const pathFor = (field: string, index?: number) =>
		[sourcePrefix, field, index]
			.filter((part) => part !== undefined && part !== "")
			.join(".");

	const vars = getRecord(source, "vars");
	if (vars) {
		for (const [name, value] of Object.entries(vars)) {
			imports.add("bindings");
			addBinding(
				bindings,
				name,
				typeof value === "string"
					? call("bindings.text", value)
					: call("bindings.json", toOutputValue(value) ?? null),
				pathFor("vars"),
				report
			);
		}
	}

	const secrets = getRecord(source, "secrets");
	if (secrets) {
		for (const name of getStrings(secrets, "required")) {
			imports.add("bindings");
			addBinding(
				bindings,
				name,
				call("bindings.secret"),
				pathFor("secrets.required"),
				report
			);
		}
	}

	function convertArrayBindings(
		field: string,
		nameKey: string,
		callee: string,
		mappings: ReadonlyArray<readonly [string, string]>,
		options: { remote?: boolean; unsupported?: string[] } = {}
	): void {
		for (const [index, entry] of getRecords(source, field).entries()) {
			imports.add("bindings");
			const sourcePath = pathFor(field, index);
			addBinding(
				bindings,
				entry[nameKey],
				call(callee, optionsFromRecord(entry, mappings, options.remote)),
				sourcePath,
				report
			);
			reportUnsupportedOptions(
				entry,
				options.unsupported ?? [],
				sourcePath,
				report
			);
		}
	}

	convertArrayBindings(
		"agent_memory",
		"binding",
		"bindings.agentMemory",
		[["namespace", "namespace"]],
		{ remote: true }
	);
	convertArrayBindings(
		"ai_search",
		"binding",
		"bindings.aiSearch",
		[["instance_name", "name"]],
		{ remote: true }
	);
	convertArrayBindings(
		"ai_search_namespaces",
		"binding",
		"bindings.aiSearchNamespace",
		[["namespace", "namespace"]],
		{ remote: true }
	);
	convertArrayBindings(
		"analytics_engine_datasets",
		"binding",
		"bindings.analyticsEngineDataset",
		[["dataset", "name"]]
	);
	convertArrayBindings(
		"artifacts",
		"binding",
		"bindings.artifacts",
		[["namespace", "namespace"]],
		{ remote: true }
	);
	convertArrayBindings(
		"d1_databases",
		"binding",
		"bindings.d1",
		[
			["database_name", "name"],
			["database_id", "id"],
		],
		{
			remote: true,
			unsupported: [
				"database_internal_env",
				"migrations_dir",
				"migrations_pattern",
				"migrations_table",
				"preview_database_id",
			],
		}
	);
	convertArrayBindings(
		"flagship",
		"binding",
		"bindings.flagship",
		[["app_id", "id"]],
		{ remote: true }
	);
	for (const [index, entry] of getRecords(source, "hyperdrive").entries()) {
		const options = optionsFromRecord(entry, [["id", "id"]]);
		const sourcePath = pathFor("hyperdrive", index);
		imports.add("bindings");
		addBinding(
			bindings,
			entry.binding,
			call("bindings.hyperdrive", options),
			sourcePath,
			report
		);
		reportUnsupportedOptions(
			entry,
			["localConnectionString"],
			sourcePath,
			report
		);
	}
	convertArrayBindings(
		"kv_namespaces",
		"binding",
		"bindings.kv",
		[["id", "id"]],
		{ remote: true, unsupported: ["preview_id"] }
	);
	convertArrayBindings(
		"mtls_certificates",
		"binding",
		"bindings.mtlsCertificate",
		[["certificate_id", "id"]],
		{ remote: true }
	);
	for (const [index, entry] of getRecords(source, "pipelines").entries()) {
		const options = optionsFromRecord(
			{ ...entry, name: entry.stream ?? entry.pipeline },
			[["name", "name"]],
			true
		);
		imports.add("bindings");
		addBinding(
			bindings,
			entry.binding,
			call("bindings.pipeline", options),
			pathFor("pipelines", index),
			report
		);
	}
	convertArrayBindings(
		"r2_buckets",
		"binding",
		"bindings.r2",
		[
			["bucket_name", "name"],
			["jurisdiction", "jurisdiction"],
		],
		{
			remote: true,
			unsupported: ["local_dev", "preview_bucket_name"],
		}
	);
	convertArrayBindings(
		"secrets_store_secrets",
		"binding",
		"bindings.secretsStoreSecret",
		[
			["store_id", "storeId"],
			["secret_name", "secretName"],
		]
	);
	convertArrayBindings(
		"vectorize",
		"binding",
		"bindings.vectorize",
		[["index_name", "name"]],
		{ remote: true }
	);
	convertArrayBindings(
		"vpc_services",
		"binding",
		"bindings.vpcService",
		[["service_id", "id"]],
		{ remote: true }
	);
	convertArrayBindings(
		"vpc_networks",
		"binding",
		"bindings.vpcNetwork",
		[
			["tunnel_id", "tunnelId"],
			["network_id", "networkId"],
		],
		{ remote: true }
	);

	for (const [index, entry] of getRecords(
		source,
		"dispatch_namespaces"
	).entries()) {
		const options = optionsFromRecord(
			entry,
			[["namespace", "namespace"]],
			true
		);
		const outbound = getRecord(entry, "outbound");
		if (outbound) {
			const outboundTarget = { ...outbound };
			if (
				typeof outbound.service === "string" &&
				typeof outbound.environment === "string"
			) {
				outboundTarget.service = `${outbound.service}-${outbound.environment}`;
			}

			const outboundOptions = optionsFromRecord(outboundTarget, [
				["service", "worker"],
				["parameters", "parameters"],
			]);
			options.properties.push({
				key: "outbound",
				value: outboundOptions,
			});

			if (hasOwn(outbound, "environment")) {
				report(
					createFollowUp(
						"service-environment",
						"A dispatch namespace uses a legacy service environment. Verify its target Worker name.",
						{ sourcePath: pathFor("dispatch_namespaces", index) }
					)
				);
			}
		}

		imports.add("bindings");

		addBinding(
			bindings,
			entry.binding,
			call("bindings.dispatchNamespace", options),
			pathFor("dispatch_namespaces", index),
			report
		);
	}

	for (const [index, entry] of getRecords(source, "send_email").entries()) {
		imports.add("bindings");
		addBinding(
			bindings,
			entry.name,
			call(
				"bindings.sendEmail",
				optionsFromRecord(
					entry,
					[
						["destination_address", "destinationAddress"],
						["allowed_destination_addresses", "allowedDestinationAddresses"],
						["allowed_sender_addresses", "allowedSenderAddresses"],
					],
					true
				)
			),
			pathFor("send_email", index),
			report
		);
	}

	const queues = getRecord(source, "queues");
	if (queues) {
		for (const [index, entry] of getRecords(queues, "producers").entries()) {
			imports.add("bindings");
			addBinding(
				bindings,
				entry.binding,
				call(
					"bindings.queue",
					optionsFromRecord(
						entry,
						[
							["queue", "name"],
							["delivery_delay", "deliveryDelay"],
						],
						true
					)
				),
				pathFor("queues.producers", index),
				report
			);
		}
	}

	for (const [index, entry] of getRecords(source, "services").entries()) {
		let worker = entry.service;
		if (typeof entry.environment === "string" && typeof worker === "string") {
			worker = `${worker}-${entry.environment}`;
			report(
				createFollowUp(
					"service-environment",
					"A service binding used a legacy service environment. Verify the generated Worker name.",
					{ sourcePath: pathFor("services", index) }
				)
			);
		}

		const service = { ...entry, service: worker };
		imports.add("bindings");

		addBinding(
			bindings,
			entry.binding,
			call(
				"bindings.worker",
				optionsFromRecord(
					service,
					[
						["service", "worker"],
						["entrypoint", "exportName"],
						["props", "props"],
					],
					true
				)
			),
			pathFor("services", index),
			report
		);
	}

	const durableObjects = getRecord(source, "durable_objects");
	if (durableObjects) {
		for (const [index, entry] of getRecords(
			durableObjects,
			"bindings"
		).entries()) {
			let worker =
				typeof entry.script_name === "string"
					? entry.script_name
					: typeof source.name === "string"
						? source.name
						: "TODO";
			if (typeof entry.environment === "string") {
				worker = `${worker}-${entry.environment}`;
			}

			const sourcePath = pathFor("durable_objects.bindings", index);
			imports.add("bindings");

			addBinding(
				bindings,
				entry.name,
				call(
					"bindings.durableObject",
					optionsFromRecord(
						{
							export_name: entry.class_name,
							worker,
						},
						[
							["worker", "worker"],
							["export_name", "exportName"],
						]
					)
				),
				sourcePath,
				report
			);
			report(
				createFollowUp(
					"durable-object-review",
					"Durable Object bindings require manual review after migration.",
					{
						docsUrl: DURABLE_OBJECT_EXPORTS_DOCS_URL,
						sourcePath,
					}
				)
			);
		}
	}

	if (getRecords(source, "workflows").length > 0) {
		report(
			createFollowUp(
				"workflows-unsupported",
				"Workflow bindings are not supported by the new config and were not migrated.",
				{ sourcePath: pathFor("workflows") }
			)
		);
	}

	function convertSingletonBinding(
		field: string,
		nameKey: string,
		callee: string,
		unsupported: string[] = []
	): void {
		const entry = getRecord(source, field);
		if (!entry) {
			return;
		}

		imports.add("bindings");

		addBinding(
			bindings,
			entry[nameKey],
			call(callee, optionsFromRecord(entry, [], true)),
			pathFor(field),
			report
		);
		reportUnsupportedOptions(entry, unsupported, pathFor(field), report);
	}

	convertSingletonBinding("ai", "binding", "bindings.ai", ["staging"]);
	convertSingletonBinding("browser", "binding", "bindings.browser");
	convertSingletonBinding("images", "binding", "bindings.images");
	convertSingletonBinding("media", "binding", "bindings.media");
	convertSingletonBinding("stream", "binding", "bindings.stream");

	const versionMetadata = getRecord(source, "version_metadata");
	if (versionMetadata) {
		imports.add("bindings");
		addBinding(
			bindings,
			versionMetadata.binding,
			call("bindings.versionMetadata"),
			pathFor("version_metadata"),
			report
		);
	}

	for (const [index, entry] of getRecords(source, "ratelimits").entries()) {
		imports.add("bindings");
		addBinding(
			bindings,
			entry.name,
			call(
				"bindings.rateLimit",
				optionsFromRecord(entry, [
					["namespace_id", "namespace"],
					["simple", "simple"],
				])
			),
			pathFor("ratelimits", index),
			report
		);
	}

	for (const [index, entry] of getRecords(source, "worker_loaders").entries()) {
		imports.add("bindings");
		addBinding(
			bindings,
			entry.binding,
			call("bindings.workerLoader"),
			pathFor("worker_loaders", index),
			report
		);
	}

	const logfwdr = getRecord(source, "logfwdr");
	if (logfwdr) {
		for (const [index, entry] of getRecords(logfwdr, "bindings").entries()) {
			imports.add("bindings");
			addBinding(
				bindings,
				entry.name,
				call(
					"bindings.logfwdr",
					optionsFromRecord(entry, [["destination", "destination"]])
				),
				pathFor("logfwdr.bindings", index),
				report
			);
		}
	}

	const unsafe = getRecord(source, "unsafe");
	if (unsafe) {
		for (const [index, entry] of getRecords(unsafe, "bindings").entries()) {
			const type = entry.type;
			const output = objectFromRecord({
				...entry,
				type: `unsafe:${String(type)}`,
			});
			output.properties = output.properties.filter(({ key }) => key !== "name");
			addBinding(
				bindings,
				entry.name,
				output,
				pathFor("unsafe.bindings", index),
				report
			);
		}
	}

	const assets = getRecord(source, "assets");
	if (assets && typeof assets.binding === "string") {
		imports.add("bindings");
		addBinding(
			bindings,
			assets.binding,
			call("bindings.assets"),
			pathFor("assets.binding"),
			report
		);
	}

	if (bindings.size === 0) {
		return undefined;
	}

	return {
		kind: "object",
		properties: [...bindings].map(([key, value]) => ({
			key,
			value,
		})),
	};
}

function convertTriggers(
	source: UnknownRecord,
	sourcePrefix: string,
	imports: Set<string>,
	report: (followUp: MigrationFollowUp) => void
): { domains?: string[]; triggers?: OutputValue[] } {
	const domains: string[] = [];
	const converted: OutputValue[] = [];
	const routes: unknown[] = [
		...(hasOwn(source, "route") ? [source.route] : []),
		...(Array.isArray(source.routes) ? source.routes : []),
	];

	for (const [index, route] of routes.entries()) {
		if (typeof route === "string") {
			imports.add("triggers");
			converted.push(
				call("triggers.fetch", {
					kind: "object",
					properties: [
						{
							key: "pattern",
							value: route,
						},
					],
				})
			);
			continue;
		}

		if (!isRecord(route) || typeof route.pattern !== "string") {
			report(
				createFollowUp(
					"invalid-route",
					"A Wrangler route could not be migrated.",
					{ sourcePath: `${sourcePrefix || "config"}.routes.${index}` }
				)
			);
			continue;
		}

		if (route.custom_domain === true) {
			domains.push(route.pattern);

			if (hasOwn(route, "enabled") || hasOwn(route, "previews_enabled")) {
				report(
					createFollowUp(
						"custom-domain-options",
						"Custom-domain route options require manual review.",
						{ sourcePath: `${sourcePrefix || "config"}.routes.${index}` }
					)
				);
			}

			continue;
		}

		imports.add("triggers");

		const options: OutputProperty[] = [
			{
				key: "pattern",
				value: route.pattern,
			},
		];
		if (typeof route.zone_name === "string") {
			options.push({
				key: "zone",
				value: route.zone_name,
			});
		} else if (typeof route.zone_id === "string") {
			options.push({
				key: "zone",
				value: route.zone_id,
			});
			report(
				createFollowUp(
					"zone-id-route",
					"A route uses a zone ID. Verify the generated fetch trigger target.",
					{ sourcePath: `${sourcePrefix || "config"}.routes.${index}` }
				)
			);
		}
		converted.push(
			call("triggers.fetch", {
				kind: "object",
				properties: options,
			})
		);
	}

	const triggerConfig = getRecord(source, "triggers");
	if (triggerConfig) {
		for (const schedule of getStrings(triggerConfig, "crons")) {
			imports.add("triggers");
			converted.push(
				call("triggers.scheduled", {
					kind: "object",
					properties: [
						{
							key: "schedule",
							value: schedule,
						},
					],
				})
			);
		}

		if (
			Array.isArray(triggerConfig.events) &&
			triggerConfig.events.length > 0
		) {
			report(
				createFollowUp(
					"artifact-event-triggers",
					"Artifact event triggers are not supported by the new config and were not migrated.",
					{ sourcePath: `${sourcePrefix || "config"}.triggers.events` }
				)
			);
		}
	}

	const queues = getRecord(source, "queues");
	if (queues) {
		for (const consumer of getRecords(queues, "consumers")) {
			imports.add("triggers");
			converted.push(
				call(
					"triggers.queue",
					optionsFromRecord(consumer, [
						["dead_letter_queue", "deadLetterQueue"],
						["max_batch_size", "maxBatchSize"],
						["max_batch_timeout", "maxBatchTimeout"],
						["max_concurrency", "maxConcurrency"],
						["max_retries", "maxRetries"],
						["queue", "name"],
						["retry_delay", "retryDelay"],
						["visibility_timeout_ms", "visibilityTimeoutMs"],
					])
				)
			);
		}
	}

	for (const connection of getRecords(source, "connect")) {
		imports.add("triggers");
		converted.push(call("triggers.connect", objectFromRecord(connection)));
	}

	const addresses = getStrings(source, "addresses");
	if (addresses.length > 0) {
		imports.add("triggers");
		converted.push(
			call("triggers.email", {
				kind: "object",
				properties: [
					{
						key: "addresses",
						value: addresses,
					},
				],
			})
		);
	}

	return {
		domains: domains.length > 0 ? domains : undefined,
		triggers: converted.length > 0 ? converted : undefined,
	};
}

function convertExports(
	source: UnknownRecord,
	sourcePrefix: string,
	imports: Set<string>,
	report: (followUp: MigrationFollowUp) => void
): OutputObject | undefined {
	const configuredExports = getRecord(source, "exports");
	if (!configuredExports) {
		return undefined;
	}

	const properties: OutputProperty[] = [];
	for (const [name, value] of Object.entries(configuredExports)) {
		if (!isRecord(value)) {
			continue;
		}

		const sourcePath = `${sourcePrefix ? `${sourcePrefix}.` : ""}exports.${name}`;
		if (value.type === "worker") {
			imports.add("exports");
			const args = getRecord(value, "cache");
			properties.push({
				key: name,
				value: args
					? call("exports.worker", {
							kind: "object",
							properties: [
								{
									key: "cache",
									value: camelObject(args),
								},
							],
						})
					: call("exports.worker"),
			});
			continue;
		}

		if (value.type === "durable-object") {
			imports.add("exports");
			const options = optionsFromRecord(value, [
				["renamed_to", "renamedTo"],
				["state", "state"],
				["storage", "storage"],
				["transfer_from", "transferFrom"],
				["transferred_to", "transferredTo"],
			]);
			properties.push({
				key: name,
				value: call("exports.durableObject", options),
			});
			report(
				createFollowUp(
					"durable-object-review",
					"Durable Object exports require manual review after migration.",
					{ docsUrl: DURABLE_OBJECT_EXPORTS_DOCS_URL, sourcePath }
				)
			);
			if (hasOwn(value, "container")) {
				report(
					createFollowUp(
						"container-review",
						"A Durable Object export references a Container. Reconnect it manually after migrating the Container.",
						{ sourcePath }
					)
				);
			}
			continue;
		}

		report(
			createFollowUp(
				"unsupported-export",
				`The export \`${name}\` could not be migrated.`,
				{ sourcePath }
			)
		);
	}
	return properties.length > 0 ? { kind: "object", properties } : undefined;
}

function convertWorkerConfig(
	source: UnknownRecord,
	sourcePrefix: string,
	bundler: MigrationBundler,
	imports: Set<string>,
	followUps: MigrationFollowUp[]
): OutputObject {
	const properties: OutputProperty[] = [];
	const comments: OutputComment[] = [];
	const report = (followUp: MigrationFollowUp) => {
		followUps.push(followUp);
		comments.push(followUpToComment(followUp));
	};

	if (typeof source.name === "string") {
		properties.push({ key: "name", value: source.name });
	} else {
		const followUp = createFollowUp(
			"missing-name",
			"Wrangler config has no Worker name. Replace the generated placeholder.",
			{ sourcePath: sourcePrefix ? `${sourcePrefix}.name` : "name" }
		);
		followUps.push(followUp);
		properties.push({
			comments: [followUpToComment(followUp)],
			key: "name",
			value: "TODO",
		});
	}

	if (typeof source.compatibility_date === "string") {
		properties.push({
			key: "compatibilityDate",
			value: source.compatibility_date,
		});
	} else {
		const followUp = createFollowUp(
			"missing-compatibility-date",
			"Wrangler config has no compatibility date. Replace the generated placeholder.",
			{
				sourcePath: sourcePrefix
					? `${sourcePrefix}.compatibility_date`
					: "compatibility_date",
			}
		);
		followUps.push(followUp);
		properties.push({
			comments: [followUpToComment(followUp)],
			key: "compatibilityDate",
			value: "YYYY-MM-DD",
		});
	}

	addProperty(properties, source, "compatibility_flags", "compatibilityFlags");
	addProperty(properties, source, "main", "entrypoint");
	addProperty(properties, source, "workers_dev", "workersDev");
	addProperty(properties, source, "preview_urls", "previewUrls");
	addProperty(properties, source, "first_party_worker", "firstPartyWorker");
	addProperty(properties, source, "logpush");
	addProperty(properties, source, "placement", "placement", (value) =>
		isRecord(value) ? camelObject(value) : undefined
	);
	addProperty(properties, source, "limits", "limits", (value) =>
		isRecord(value) ? camelObject(value) : undefined
	);
	addProperty(properties, source, "cache", "cache", (value) =>
		isRecord(value) ? camelObject(value) : undefined
	);
	addProperty(properties, source, "observability", "observability", (value) =>
		isRecord(value) ? camelObject(value) : undefined
	);

	const assets = getRecord(source, "assets");
	if (assets) {
		const runtimeAssets = optionsFromRecord(assets, [
			["html_handling", "htmlHandling"],
			["not_found_handling", "notFoundHandling"],
			["run_worker_first", "runWorkerFirst"],
		]);
		if (runtimeAssets.properties.length > 0) {
			properties.push({ key: "assets", value: runtimeAssets });
		}
		if (bundler === "vite" && hasOwn(assets, "directory")) {
			report(
				createFollowUp(
					"vite-assets-directory",
					"The Wrangler assets directory was not migrated. Configure static assets in the Vite project.",
					{
						docsUrl: CONFIGURATION_DOCS_URL,
						sourcePath: `${sourcePrefix ? `${sourcePrefix}.` : ""}assets.directory`,
					}
				)
			);
		}
	}

	const convertedTriggers = convertTriggers(
		source,
		sourcePrefix,
		imports,
		report
	);
	if (convertedTriggers.domains) {
		properties.push({
			key: "domains",
			value: convertedTriggers.domains,
		});
	}
	if (convertedTriggers.triggers) {
		properties.push({
			key: "triggers",
			value: convertedTriggers.triggers,
		});
	}

	const tailConsumers: OutputValue[] = [];
	for (const [index, entry] of getRecords(source, "tail_consumers").entries()) {
		let worker = entry.service;
		if (typeof entry.environment === "string" && typeof worker === "string") {
			worker = `${worker}-${entry.environment}`;
			report(
				createFollowUp(
					"service-environment",
					"A tail consumer used a legacy service environment. Verify the generated Worker name.",
					{ sourcePath: `${sourcePrefix || "config"}.tail_consumers.${index}` }
				)
			);
		}

		const value = toOutputValue(worker);
		if (value !== undefined) {
			tailConsumers.push({
				kind: "object",
				properties: [
					{
						key: "worker",
						value,
					},
				],
			});
		}
	}

	for (const entry of getRecords(source, "streaming_tail_consumers")) {
		if (typeof entry.service === "string") {
			tailConsumers.push({
				kind: "object",
				properties: [
					{
						key: "worker",
						value: entry.service,
					},
					{
						key: "streaming",
						value: true,
					},
				],
			});
		}
	}
	if (tailConsumers.length > 0) {
		properties.push({
			key: "tailConsumers",
			value: tailConsumers,
		});
	}

	const bindings = convertBindings(source, sourcePrefix, imports, report);
	if (bindings) {
		properties.push({
			key: "env",
			value: bindings,
		});
	}
	const configuredExports = convertExports(
		source,
		sourcePrefix,
		imports,
		report
	);
	if (configuredExports) {
		properties.push({
			key: "exports",
			value: configuredExports,
		});
	}

	const unsafe = getRecord(source, "unsafe");
	if (unsafe) {
		const runtimeUnsafe: OutputProperty[] = [];

		const metadata = getRecord(unsafe, "metadata");
		if (metadata) {
			runtimeUnsafe.push({
				key: "metadata",
				value: objectFromRecord(metadata),
			});
		}

		const capnp = getRecord(unsafe, "capnp");
		if (capnp) {
			runtimeUnsafe.push({
				key: "capnp",
				value: camelObject(capnp),
			});
		}

		if (runtimeUnsafe.length > 0) {
			properties.push({
				key: "unsafe",
				value: {
					kind: "object",
					properties: runtimeUnsafe,
				},
			});
		}
	}

	if (Array.isArray(source.migrations) && source.migrations.length > 0) {
		report(
			createFollowUp(
				"durable-object-migrations",
				'Wrangler Durable Object migrations are unsupported. Replace them with an exports lifecycle declaration, for example `exports: { MyDurableObject: exports.durableObject({ storage: "sqlite" }) }`.',
				{
					docsUrl: DURABLE_OBJECT_EXPORTS_DOCS_URL,
					sourcePath: `${sourcePrefix ? `${sourcePrefix}.` : ""}migrations`,
				}
			)
		);
	}
	if (Array.isArray(source.containers) && source.containers.length > 0) {
		report(
			createFollowUp(
				"container-review",
				"Containers require manual review and were not migrated.",
				{ sourcePath: `${sourcePrefix ? `${sourcePrefix}.` : ""}containers` }
			)
		);
	}

	const unsupportedFields: Array<[string, string]> = [
		["access", "Cloudflare Access configuration"],
		["cloudchamber", "Cloudchamber configuration"],
		["dependencies_instrumentation", "dependency instrumentation"],
		["keep_vars", "keep_vars"],
		["pages_build_output_dir", "Pages configuration"],
		["site", "Workers Sites configuration"],
		["unsafe_hello_world", "unsafe_hello_world bindings"],
	];
	for (const [field, label] of unsupportedFields) {
		if (hasOwn(source, field)) {
			report(
				createFollowUp(
					"unsupported-field",
					`The ${label} is not supported by the new config and was not migrated.`,
					{
						docsUrl: CONFIGURATION_DOCS_URL,
						sourcePath: `${sourcePrefix ? `${sourcePrefix}.` : ""}${field}`,
					}
				)
			);
		}
	}

	return {
		kind: "object",
		properties,
		trailingComments: comments.length > 0 ? comments : undefined,
	};
}

function convertRootConfig(
	source: UnknownRecord,
	sourcePrefix: string,
	bundler: MigrationBundler,
	imports: Set<string>,
	followUps: MigrationFollowUp[]
): OutputObject {
	const properties: OutputProperty[] = [];
	if (typeof source.account_id === "string") {
		properties.push({ key: "accountId", value: source.account_id });
	}

	if (source.compliance_region === "public") {
		properties.push({ key: "complianceRegion", value: "public" });
	} else if (source.compliance_region === "fedramp_high") {
		properties.push({ key: "complianceRegion", value: "fedramp-high" });
	}

	properties.push({
		key: "worker",
		value: convertWorkerConfig(
			source,
			sourcePrefix,
			bundler,
			imports,
			followUps
		),
	});

	return {
		kind: "object",
		properties,
	};
}

function convertToolingObject(source: UnknownRecord): OutputObject | undefined {
	const properties: OutputProperty[] = [];
	const mappings: Array<[string, string]> = [
		["alias", "alias"],
		["base_dir", "baseDir"],
		["data_blobs", "dataBlobs"],
		["define", "define"],
		["find_additional_modules", "findAdditionalModules"],
		["jsx_factory", "jsxFactory"],
		["jsx_fragment", "jsxFragment"],
		["keep_names", "keepNames"],
		["minify", "minify"],
		["no_bundle", "noBundle"],
		["preserve_file_names", "preserveFileNames"],
		["python_modules", "pythonModules"],
		["rules", "rules"],
		["send_metrics", "sendMetrics"],
		["text_blobs", "textBlobs"],
		["tsconfig", "tsconfig"],
		["upload_source_maps", "uploadSourceMaps"],
		["wasm_modules", "wasmModules"],
	];
	for (const [sourceKey, targetKey] of mappings) {
		addProperty(properties, source, sourceKey, targetKey, (sourceValue) =>
			sourceKey === "python_modules" && isRecord(sourceValue)
				? camelObject(sourceValue)
				: toOutputValue(sourceValue)
		);
	}

	const build = getRecord(source, "build");
	if (build) {
		properties.push({ key: "build", value: camelObject(build) });
	}

	const dev = getRecord(source, "dev");
	if (dev) {
		const devOptions = optionsFromRecord(dev, [
			["enable_containers", "enableContainers"],
			["host", "host"],
			["inspector_ip", "inspectorIp"],
			["inspector_port", "inspectorPort"],
			["ip", "ip"],
			["local_protocol", "localProtocol"],
			["port", "port"],
			["upstream_protocol", "upstreamProtocol"],
		]);
		if (typeof dev.container_engine === "string") {
			devOptions.properties.push({
				key: "containerEngine",
				value: dev.container_engine,
			});
		}
		if (devOptions.properties.length > 0) {
			properties.push({ key: "dev", value: devOptions });
		}
		if (typeof dev.generate_types === "boolean") {
			properties.push({
				key: "types",
				value: {
					kind: "object",
					properties: [{ key: "generate", value: dev.generate_types }],
				},
			});
		}
	}

	const assets = getRecord(source, "assets");
	if (assets && typeof assets.directory === "string") {
		properties.push({ key: "assetsDirectory", value: assets.directory });
	}

	return properties.length > 0 ? { kind: "object", properties } : undefined;
}

function addViteToolingFollowUp(
	source: UnknownRecord,
	location: string,
	sourcePrefix: string,
	followUps: MigrationFollowUp[]
): void {
	const toolingFields = [...TOOLING_FIELDS].filter((field) =>
		hasOwn(source, field)
	);
	const assets = getRecord(source, "assets");
	if (assets && hasOwn(assets, "directory")) {
		toolingFields.push("assets.directory");
	}

	if (toolingFields.length === 0) {
		return;
	}

	followUps.push(
		createFollowUp(
			"vite-tooling-config",
			`Wrangler-specific tooling fields${location ? ` in ${location}` : ""} were not migrated because the Vite bundler is selected: ${toolingFields.join(", ")}.`,
			{
				sourcePath: sourcePrefix
					? `${sourcePrefix}.${toolingFields.join(",")}`
					: toolingFields.join(","),
			}
		)
	);
}

function convertBranch(
	source: UnknownRecord,
	sourcePrefix: string,
	bundler: MigrationBundler,
	imports: Set<string>,
	followUps: MigrationFollowUp[]
): ConvertedBranch {
	const config = convertRootConfig(
		source,
		sourcePrefix,
		bundler,
		imports,
		followUps
	);

	const previews = getRecord(source, "previews");
	if (!previews) {
		return {
			config,
		};
	}

	const previewPath = `${sourcePrefix ? `${sourcePrefix}.` : ""}previews`;
	const followUp = createFollowUp(
		"preview-review",
		"Preview configuration was converted to `ctx.isPreview` handling. Review the generated Preview branch.",
		{ docsUrl: PREVIEWS_DOCS_URL, sourcePath: previewPath }
	);
	followUps.push(followUp);

	const worker = config.properties.find(({ key }) => key === "worker")?.value;
	if (
		worker &&
		!Array.isArray(worker) &&
		typeof worker === "object" &&
		worker.kind === "object"
	) {
		worker.trailingComments = [
			...(worker.trailingComments ?? []),
			followUpToComment(followUp),
		];
	}

	const previewSource = createPreviewSource(source, previews);

	return {
		config,
		previewConfig: convertRootConfig(
			previewSource,
			previewPath,
			bundler,
			imports,
			followUps
		),
	};
}

function convertToolingBranch(
	source: UnknownRecord
): ConvertedBranch | undefined {
	const config = convertToolingObject(source);
	const previews = getRecord(source, "previews");
	const previewConfig = previews
		? convertToolingObject(createPreviewSource(source, previews))
		: undefined;

	if (!config && !previewConfig) {
		return undefined;
	}

	return {
		config: config ?? { kind: "object", properties: [] },
		previewConfig: previews
			? (previewConfig ?? { kind: "object", properties: [] })
			: undefined,
	};
}

export function convertWranglerConfig(
	rawConfig: RawConfig,
	bundler: MigrationBundler,
	secretFiles: string[]
): ConvertedWranglerConfig {
	const source = rawConfig as UnknownRecord;
	const imports = new Set<string>();
	const followUps: MigrationFollowUp[] = [];
	addUnknownFieldFollowUps(source, "", followUps);

	const environments = getRecord(source, "env") ?? {};
	for (const [name, environment] of Object.entries(environments)) {
		if (isRecord(environment)) {
			addUnknownFieldFollowUps(environment, `env.${name}`, followUps);
			continue;
		}

		followUps.push(
			createFollowUp(
				"invalid-environment",
				`The Wrangler environment \`${name}\` is not an object and was not migrated.`,
				{ sourcePath: `env.${name}` }
			)
		);
	}

	if (secretFiles.length > 0) {
		followUps.push(
			createFollowUp(
				"secret-files-not-migrated",
				`Secret-like files were detected but not read or migrated: ${secretFiles.join(", ")}. Only \`secrets.required\` entries are migrated.`,
				{
					blocking: false,
					docsUrl: SECRETS_DOCS_URL,
				}
			)
		);
	}

	const sourcePreviews = getRecord(source, "previews");
	if (bundler === "vite") {
		addViteToolingFollowUp(source, "", "", followUps);
		if (sourcePreviews) {
			addViteToolingFollowUp(
				sourcePreviews,
				"previews",
				"previews",
				followUps
			);
		}
	}

	const isWranglerBundle = bundler === "wrangler";
	if (isWranglerBundle) {
		const dev = getRecord(source, "dev");
		if (dev && isRecord(dev.container_engine)) {
			followUps.push(
				createFollowUp(
					"container-engine-config",
					"The structured Wrangler container engine setting is not supported by wrangler.config.ts and was not migrated.",
					{ sourcePath: "dev.container_engine" }
				)
			);
		}
	}

	if (bundler === "vite") {
		for (const [name, environment] of Object.entries(environments)) {
			if (!isRecord(environment)) {
				continue;
			}

			addViteToolingFollowUp(
				environment,
				`environment \`${name}\``,
				`env.${name}`,
				followUps
			);

			const environmentPreviews = getRecord(environment, "previews");
			if (environmentPreviews) {
				addViteToolingFollowUp(
					environmentPreviews,
					`environment \`${name}\` previews`,
					`env.${name}.previews`,
					followUps
				);
			}
		}
	}

	const baseSource = createBranchSource(source, {});
	const base = convertBranch(baseSource, "", bundler, imports, followUps);
	const convertedEnvironments = new Map<string, ConvertedBranch>();
	const toolingEnvironments = new Map<string, ConvertedBranch>();

	for (const [name, value] of Object.entries(environments)) {
		if (!isRecord(value)) {
			continue;
		}

		const environmentSource = createBranchSource(source, value, name);
		convertedEnvironments.set(
			name,
			convertBranch(
				environmentSource,
				`env.${name}`,
				bundler,
				imports,
				followUps
			)
		);
		if (isWranglerBundle) {
			const tooling = convertToolingBranch(environmentSource);
			if (tooling) {
				toolingEnvironments.set(name, tooling);
			}
		}
	}

	if (convertedEnvironments.size > 0) {
		followUps.push(
			createFollowUp(
				"environments-migrated",
				"Wrangler environments were migrated to a `switch (ctx.mode)` statement. Select one with the `--mode` flag.",
				{ blocking: false, docsUrl: ENVIRONMENTS_DOCS_URL, sourcePath: "env" }
			)
		);
	}

	return {
		base,
		environments: convertedEnvironments,
		followUps: deduplicateFollowUps(followUps),
		imports,
		toolingBase: isWranglerBundle
			? convertToolingBranch(baseSource)
			: undefined,
		toolingEnvironments,
	};
}
