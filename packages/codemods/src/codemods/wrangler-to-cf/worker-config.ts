import { convertBindings } from "./bindings";
import {
	addProperty,
	camelObject,
	getRecord,
	getRecords,
	hasOwn,
	isRecord,
	objectFromRecord,
	optionsFromRecord,
	toOutputValue,
	type UnknownRecord,
} from "./converter-helpers";
import { convertExports } from "./exports";
import {
	CONFIGURATION_DOCS_URL,
	DURABLE_OBJECT_EXPORTS_DOCS_URL,
	createFollowUp,
	followUpToComment,
} from "./follow-ups";
import { convertTriggers } from "./triggers";
import type {
	MigrationBundler,
	MigrationFollowUp,
	OutputComment,
	OutputObject,
	OutputProperty,
	OutputValue,
} from "./types";

export function convertWorkerConfig(
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

export function convertRootConfig(
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
