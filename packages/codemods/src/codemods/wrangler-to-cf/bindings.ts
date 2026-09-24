import {
	call,
	getRecord,
	getRecords,
	getStrings,
	hasOwn,
	objectFromRecord,
	optionsFromRecord,
	toOutputValue,
	type UnknownRecord,
} from "./converter-helpers";
import { DURABLE_OBJECT_EXPORTS_DOCS_URL, createFollowUp } from "./follow-ups";
import type { MigrationFollowUp, OutputObject, OutputValue } from "./types";

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

export function convertBindings(
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
