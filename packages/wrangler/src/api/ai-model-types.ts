import { UserError } from "@cloudflare/workers-utils";
import { createCloudflareClient } from "../cfetch/internal";
import { readConfig } from "../config";
import { requireAuth } from "../user";
import type { Model } from "../ai/types";
import type Cloudflare from "cloudflare";

type JsonSchemaPrimitiveType =
	| "array"
	| "boolean"
	| "integer"
	| "null"
	| "number"
	| "object"
	| "string";

export type Experimental_JsonSchema =
	| boolean
	| {
			$defs?: Record<string, Experimental_JsonSchema>;
			$ref?: string;
			additionalProperties?: boolean | Experimental_JsonSchema;
			allOf?: Experimental_JsonSchema[];
			anyOf?: Experimental_JsonSchema[];
			const?: unknown;
			definitions?: Record<string, Experimental_JsonSchema>;
			description?: string;
			enum?: unknown[];
			format?: string;
			items?: Experimental_JsonSchema | Experimental_JsonSchema[];
			nullable?: boolean;
			oneOf?: Experimental_JsonSchema[];
			properties?: Record<string, Experimental_JsonSchema>;
			required?: string[];
			type?: JsonSchemaPrimitiveType | JsonSchemaPrimitiveType[];
			[key: string]: unknown;
	  };

export interface Experimental_AiModelSchema {
	input?: Experimental_JsonSchema;
	output?: Experimental_JsonSchema;
	[key: string]: unknown;
}

export interface Experimental_AiModelTypeEntry {
	model: string;
	schema: Experimental_AiModelSchema;
	modelTypeName: string;
	inputTypeName: string;
	outputTypeName: string;
	inputType: string;
	outputType: string;
}

export interface Experimental_ListAiModelsOptions {
	/**
	 * Path to a Wrangler configuration file to use for auth and account defaults.
	 */
	config?: string;
	/**
	 * Environment to select from the Wrangler configuration file.
	 */
	env?: string;
	/**
	 * Account ID to use instead of the account selected from auth/config.
	 */
	accountId?: string;
	/**
	 * Filter models by author.
	 */
	author?: string;
	/**
	 * Filter experimental models out of results.
	 */
	hideExperimental?: boolean;
	/**
	 * Search query for model names and metadata.
	 */
	search?: string;
	/**
	 * Filter models by source ID.
	 */
	source?: number;
	/**
	 * Filter models by task name.
	 */
	task?: string;
}

export interface Experimental_GetAiModelSchemaOptions {
	/**
	 * Path to a Wrangler configuration file to use for auth and account defaults.
	 */
	config?: string;
	/**
	 * Environment to select from the Wrangler configuration file.
	 */
	env?: string;
	/**
	 * Account ID to use instead of the account selected from auth/config.
	 */
	accountId?: string;
	/**
	 * Workers AI model name, for example `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.
	 */
	model: string;
}

export interface Experimental_GenerateAiModelTypesOptions {
	/**
	 * Path to a Wrangler configuration file to use for auth and account defaults.
	 */
	config?: string;
	/**
	 * Environment to select from the Wrangler configuration file.
	 */
	env?: string;
	/**
	 * Account ID to use instead of the account selected from auth/config.
	 */
	accountId?: string;
	/**
	 * Workers AI model names to query and generate type declarations for.
	 */
	models: string[];
	/**
	 * Prefix for generated type names. Defaults to `CloudflareAi`.
	 */
	typeNamePrefix?: string;
}

export interface Experimental_GenerateAiModelTypesResult {
	/**
	 * Ambient TypeScript declarations generated from the requested model schemas.
	 */
	declarations: string;
	/**
	 * Generated type metadata for each unique model, preserving the input order.
	 */
	models: Experimental_AiModelTypeEntry[];
	/**
	 * Name of the generated `Ai<...>` binding type alias.
	 */
	bindingTypeName: string;
	/**
	 * Name of the generated model map interface.
	 */
	modelMapTypeName: string;
}

type AiModelListParams = {
	account_id: string;
	author?: string;
	hide_experimental?: boolean;
	page?: number;
	per_page?: number;
	search?: string;
	source?: number;
	task?: string;
};

type AiModelTypesContext = {
	accountId: string;
	sdk: Cloudflare;
};

type ObjectProperty = {
	name: string;
	required: boolean;
	type: string;
};

type SchemaToTypeContext = {
	roots: unknown[];
	seenRefs: Set<string>;
};

/**
 * List Workers AI models from the public Cloudflare API.
 *
 * @description Programmatic equivalent of querying the Workers AI model catalog,
 * intended for editor and tooling integrations.
 */
export async function listAiModels(
	options: Experimental_ListAiModelsOptions = {}
): Promise<Model[]> {
	const { accountId, sdk } = await getAiModelTypesContext(options);
	const models: Model[] = [];
	const pageSize = 50;
	let page = 1;

	while (true) {
		const response = await sdk.ai.models.list(
			getAiModelListParams(accountId, options, page, pageSize)
		);
		const pageModels = response.getPaginatedItems().map(normalizeModel);
		models.push(...pageModels);

		if (pageModels.length < pageSize) {
			break;
		}
		page++;
	}

	return models;
}

/**
 * Fetch a Workers AI model schema from the public Cloudflare API.
 */
export async function getAiModelSchema(
	options: Experimental_GetAiModelSchemaOptions
): Promise<Experimental_AiModelSchema> {
	const { accountId, sdk } = await getAiModelTypesContext(options);
	return await getAiModelSchemaFromContext(sdk, accountId, options.model);
}

/**
 * Generate TypeScript declarations from live Workers AI model schemas.
 *
 * @description The returned declarations can be written to a `.d.ts` file and
 * used as the model map for the `Ai<...>` binding type.
 */
export async function generateAiModelTypes(
	options: Experimental_GenerateAiModelTypesOptions
): Promise<Experimental_GenerateAiModelTypesResult> {
	const models = dedupeModels(options.models);

	if (models.length === 0) {
		throw new UserError(
			"At least one Workers AI model name is required to generate model types.",
			{
				telemetryMessage: "ai model types missing models",
			}
		);
	}

	const { accountId, sdk } = await getAiModelTypesContext(options);
	const typeNamePrefix = sanitizeTypeNamePrefix(options.typeNamePrefix);
	const entries = await Promise.all(
		models.map(async (model) => {
			const schema = await getAiModelSchemaFromContext(sdk, accountId, model);
			return generateModelTypeEntry(model, schema, typeNamePrefix);
		})
	);

	return {
		declarations: renderAiModelDeclarations(entries, typeNamePrefix),
		models: entries,
		bindingTypeName: typeNamePrefix,
		modelMapTypeName: `${typeNamePrefix}Models`,
	};
}

async function getAiModelTypesContext(options: {
	config?: string;
	env?: string;
	accountId?: string;
}): Promise<AiModelTypesContext> {
	const config = readConfig(
		{
			config: options.config,
			env: options.env,
		},
		{ hideWarnings: true }
	);
	const authConfig =
		options.accountId === undefined
			? config
			: { ...config, account_id: options.accountId };
	const accountId = await requireAuth(authConfig);
	const sdk = createCloudflareClient(config);

	return { accountId, sdk };
}

function getAiModelListParams(
	accountId: string,
	options: Experimental_ListAiModelsOptions,
	page: number,
	pageSize: number
): AiModelListParams {
	const params: AiModelListParams = {
		account_id: accountId,
		page,
		per_page: pageSize,
	};

	if (options.author !== undefined) {
		params.author = options.author;
	}
	if (options.hideExperimental !== undefined) {
		params.hide_experimental = options.hideExperimental;
	}
	if (options.search !== undefined) {
		params.search = options.search;
	}
	if (options.source !== undefined) {
		params.source = options.source;
	}
	if (options.task !== undefined) {
		params.task = options.task;
	}

	return params;
}

async function getAiModelSchemaFromContext(
	sdk: Cloudflare,
	accountId: string,
	model: string
): Promise<Experimental_AiModelSchema> {
	const schema = await sdk.ai.models.schema.get({
		account_id: accountId,
		model,
	});

	if (!isRecord(schema)) {
		throw new UserError("The Workers AI model schema response was invalid.", {
			telemetryMessage: "ai model schema invalid response",
		});
	}

	return schema;
}

function normalizeModel(model: unknown): Model {
	if (!isRecord(model)) {
		throw new UserError("The Workers AI model catalog response was invalid.", {
			telemetryMessage: "ai model catalog invalid response",
		});
	}

	const id = getStringField(model, "id");
	const name = getStringField(model, "name");
	const source = getNumberField(model, "source");
	const description = getOptionalStringField(model, "description");
	const tags = getStringArrayField(model, "tags");
	const task = normalizeTask(model.task);

	return {
		...model,
		id,
		source,
		task,
		tags,
		name,
		description,
	};
}

function normalizeTask(task: unknown): Model["task"] {
	if (task === undefined || task === null) {
		return undefined;
	}
	if (!isRecord(task)) {
		throw new UserError("The Workers AI model catalog response was invalid.", {
			telemetryMessage: "ai model catalog invalid response",
		});
	}

	return {
		id: getStringField(task, "id"),
		name: getStringField(task, "name"),
		description: getOptionalStringField(task, "description") ?? "",
	};
}

function getStringField(
	record: Record<string, unknown>,
	field: string
): string {
	const value = record[field];
	if (typeof value !== "string") {
		throw new UserError("The Workers AI model catalog response was invalid.", {
			telemetryMessage: "ai model catalog invalid response",
		});
	}
	return value;
}

function getNumberField(
	record: Record<string, unknown>,
	field: string
): number {
	const value = record[field];
	if (typeof value !== "number") {
		throw new UserError("The Workers AI model catalog response was invalid.", {
			telemetryMessage: "ai model catalog invalid response",
		});
	}
	return value;
}

function getOptionalStringField(
	record: Record<string, unknown>,
	field: string
): string | undefined {
	const value = record[field];
	if (value === undefined || value === null) {
		return undefined;
	}
	if (typeof value !== "string") {
		throw new UserError("The Workers AI model catalog response was invalid.", {
			telemetryMessage: "ai model catalog invalid response",
		});
	}
	return value;
}

function getStringArrayField(
	record: Record<string, unknown>,
	field: string
): string[] {
	const value = record[field];
	if (
		!Array.isArray(value) ||
		!value.every((item) => typeof item === "string")
	) {
		throw new UserError("The Workers AI model catalog response was invalid.", {
			telemetryMessage: "ai model catalog invalid response",
		});
	}
	return value;
}

function dedupeModels(models: string[]): string[] {
	return Array.from(new Set(models));
}

function generateModelTypeEntry(
	model: string,
	schema: Experimental_AiModelSchema,
	typeNamePrefix: string
): Experimental_AiModelTypeEntry {
	const modelTypeName = `${typeNamePrefix}_${modelNameToTypeSuffix(model)}`;
	const inputTypeName = `${modelTypeName}_Input`;
	const outputTypeName = `${modelTypeName}_Output`;
	const inputType = schemaToType(schema.input, [schema, schema.input ?? true]);
	const outputType = schemaToType(schema.output, [
		schema,
		schema.output ?? true,
	]);

	return {
		model,
		schema,
		modelTypeName,
		inputTypeName,
		outputTypeName,
		inputType,
		outputType,
	};
}

function renderAiModelDeclarations(
	entries: Experimental_AiModelTypeEntry[],
	typeNamePrefix: string
): string {
	const modelMapTypeName = `${typeNamePrefix}Models`;
	const modelEntries = entries
		.map((entry) => `\t${JSON.stringify(entry.model)}: ${entry.modelTypeName};`)
		.join("\n");
	const typeEntries = entries
		.map((entry) =>
			[
				`type ${entry.modelTypeName} = {`,
				`\tinputs: ${entry.inputTypeName};`,
				`\tpostProcessedOutputs: ${entry.outputTypeName};`,
				"};",
				"",
				`type ${entry.inputTypeName} = ${entry.inputType};`,
				`type ${entry.outputTypeName} = ${entry.outputType};`,
			].join("\n")
		)
		.join("\n\n");

	return [
		"/* eslint-disable */",
		"// Generated by Wrangler from Cloudflare Workers AI model schemas.",
		"",
		`interface ${modelMapTypeName} {`,
		modelEntries,
		"}",
		"",
		`type ${typeNamePrefix} = Ai<${modelMapTypeName}>;`,
		"",
		typeEntries,
		"",
	].join("\n");
}

function schemaToType(
	schema: Experimental_JsonSchema | undefined,
	roots: unknown[]
): string {
	return schemaToTypeWithContext(schema ?? true, {
		roots,
		seenRefs: new Set<string>(),
	});
}

function schemaToTypeWithContext(
	schema: Experimental_JsonSchema,
	context: SchemaToTypeContext
): string {
	if (schema === true) {
		return "unknown";
	}
	if (schema === false) {
		return "never";
	}

	const type = schemaObjectToType(schema, context);
	return schema.nullable === true ? unionTypes([type, "null"]) : type;
}

function schemaObjectToType(
	schema: Exclude<Experimental_JsonSchema, boolean>,
	context: SchemaToTypeContext
): string {
	if (typeof schema.$ref === "string") {
		const referencedType = refToType(schema.$ref, context);
		if (referencedType !== undefined) {
			return referencedType;
		}
	}

	if (Object.prototype.hasOwnProperty.call(schema, "const")) {
		return literalToType(schema.const);
	}

	if (Array.isArray(schema.enum)) {
		return unionTypes(schema.enum.map(literalToType));
	}

	if (Array.isArray(schema.anyOf)) {
		return unionTypes(
			schema.anyOf.map((subSchema) =>
				schemaToTypeWithContext(subSchema, context)
			)
		);
	}

	if (Array.isArray(schema.oneOf)) {
		return unionTypes(
			schema.oneOf.map((subSchema) =>
				schemaToTypeWithContext(subSchema, context)
			)
		);
	}

	if (Array.isArray(schema.allOf)) {
		return intersectionTypes(
			schema.allOf.map((subSchema) =>
				parenthesizeForIntersection(schemaToTypeWithContext(subSchema, context))
			)
		);
	}

	if (Array.isArray(schema.type)) {
		return unionTypes(
			schema.type.map((type) =>
				schemaObjectToType(
					{
						...schema,
						type,
					},
					context
				)
			)
		);
	}

	if (schema.type !== undefined) {
		return primitiveSchemaToType(schema, schema.type, context);
	}

	if (
		schema.properties !== undefined ||
		schema.additionalProperties !== undefined
	) {
		return objectSchemaToType(schema, context);
	}

	if (schema.items !== undefined) {
		return arraySchemaToType(schema, context);
	}

	return "unknown";
}

function primitiveSchemaToType(
	schema: Exclude<Experimental_JsonSchema, boolean>,
	type: JsonSchemaPrimitiveType,
	context: SchemaToTypeContext
): string {
	switch (type) {
		case "array":
			return arraySchemaToType(schema, context);
		case "boolean":
			return "boolean";
		case "integer":
		case "number":
			return "number";
		case "null":
			return "null";
		case "object":
			return objectSchemaToType(schema, context);
		case "string":
			return "string";
	}
}

function objectSchemaToType(
	schema: Exclude<Experimental_JsonSchema, boolean>,
	context: SchemaToTypeContext
): string {
	const properties = isRecordOfJsonSchemas(schema.properties)
		? schema.properties
		: {};
	const requiredProperties = new Set(
		Array.isArray(schema.required)
			? schema.required.filter((item) => typeof item === "string")
			: []
	);
	const objectProperties = Object.entries(properties).map(
		([name, propertySchema]): ObjectProperty => ({
			name,
			required: requiredProperties.has(name),
			type: schemaToTypeWithContext(propertySchema, context),
		})
	);
	const members = objectProperties.map(
		(property) =>
			`${formatPropertyName(property.name)}${property.required ? "" : "?"}: ${property.type};`
	);

	if (schema.additionalProperties !== undefined) {
		if (schema.additionalProperties !== false) {
			const additionalPropertyType =
				schema.additionalProperties === true
					? "unknown"
					: schemaToTypeWithContext(schema.additionalProperties, context);
			const propertyTypes = objectProperties.map((property) =>
				property.required
					? property.type
					: unionTypes([property.type, "undefined"])
			);
			members.push(
				`[key: string]: ${unionTypes([additionalPropertyType, ...propertyTypes])};`
			);
		}
	} else if (members.length === 0) {
		return "Record<string, unknown>";
	}

	if (members.length === 0) {
		return "{}";
	}

	return `{\n${indent(members.join("\n"))}\n}`;
}

function arraySchemaToType(
	schema: Exclude<Experimental_JsonSchema, boolean>,
	context: SchemaToTypeContext
): string {
	if (Array.isArray(schema.items)) {
		return `[${schema.items
			.map((item) => schemaToTypeWithContext(item, context))
			.join(", ")}]`;
	}

	return `Array<${schemaToTypeWithContext(schema.items ?? true, context)}>`;
}

function refToType(
	ref: string,
	context: SchemaToTypeContext
): string | undefined {
	if (context.seenRefs.has(ref)) {
		return "unknown";
	}

	for (const root of context.roots) {
		const referencedSchema = resolveRef(ref, root);
		if (referencedSchema !== undefined) {
			context.seenRefs.add(ref);
			const type = schemaToTypeWithContext(referencedSchema, context);
			context.seenRefs.delete(ref);
			return type;
		}
	}

	return undefined;
}

function resolveRef(
	ref: string,
	root: unknown
): Experimental_JsonSchema | undefined {
	if (!ref.startsWith("#/")) {
		return undefined;
	}

	let current: unknown = root;
	for (const part of ref
		.slice(2)
		.split("/")
		.map((value) => value.replace(/~1/g, "/").replace(/~0/g, "~"))) {
		if (!isRecord(current)) {
			return undefined;
		}
		current = current[part];
	}

	return isJsonSchema(current) ? current : undefined;
}

function literalToType(value: unknown): string {
	switch (typeof value) {
		case "string":
			return JSON.stringify(value);
		case "number":
			return Number.isFinite(value) ? JSON.stringify(value) : "number";
		case "boolean":
			return JSON.stringify(value);
		case "object":
			return value === null ? "null" : "unknown";
		default:
			return "unknown";
	}
}

function unionTypes(types: string[]): string {
	const uniqueTypes = Array.from(new Set(types));
	if (uniqueTypes.includes("unknown")) {
		return "unknown";
	}

	const withoutNever = uniqueTypes.filter((type) => type !== "never");
	if (withoutNever.length === 0) {
		return "never";
	}

	return withoutNever.join(" | ");
}

function intersectionTypes(types: string[]): string {
	const uniqueTypes = Array.from(new Set(types));
	if (uniqueTypes.includes("never")) {
		return "never";
	}

	const withoutUnknown = uniqueTypes.filter((type) => type !== "unknown");
	if (withoutUnknown.length === 0) {
		return "unknown";
	}

	return withoutUnknown.join(" & ");
}

function parenthesizeForIntersection(type: string): string {
	return type.includes(" | ") ? `(${type})` : type;
}

function formatPropertyName(name: string): string {
	return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function indent(value: string): string {
	return value
		.split("\n")
		.map((line) => `\t${line}`)
		.join("\n");
}

function modelNameToTypeSuffix(model: string): string {
	return sanitizeIdentifier(
		model
			.replace(/^@/, "")
			.split(/[^A-Za-z0-9]+/)
			.filter((part) => part.length > 0)
			.map(capitalize)
			.join("_")
	);
}

function sanitizeTypeNamePrefix(prefix: string | undefined): string {
	return sanitizeIdentifier(prefix ?? "CloudflareAi");
}

function sanitizeIdentifier(value: string): string {
	const identifier = value.replace(/[^A-Za-z0-9_$]/g, "_");
	const prefixedIdentifier = /^[A-Za-z_$]/.test(identifier)
		? identifier
		: `_${identifier}`;

	return prefixedIdentifier.length > 0 ? prefixedIdentifier : "CloudflareAi";
}

function capitalize(value: string): string {
	return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function isJsonSchema(value: unknown): value is Experimental_JsonSchema {
	return typeof value === "boolean" || isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordOfJsonSchemas(
	value: unknown
): value is Record<string, Experimental_JsonSchema> {
	return (
		isRecord(value) && Object.values(value).every((item) => isJsonSchema(item))
	);
}
