import * as z from "zod";
import { loadConfig } from "./load";
import {
	ConfigExportsTypeSchema,
	InputContainerSchema,
	InputSettingsSchema,
	InputWorkerSchema,
} from "./schema";
import type { ConfigContext } from "./definition";
import type {
	ParsedInputContainerConfig,
	ParsedInputSettingsConfig,
	ParsedInputWorkerConfig,
} from "./schema";

const CROSS_WORKER_BINDING_TYPES = new Set([
	"durable-object",
	"worker",
	"workflow",
]);

type ResolveDefinition = (input: unknown) => Promise<unknown>;

interface NormalizeConfigReferencesResult {
	value: unknown;
	issues: z.core.$ZodIssue[];
}

export type ParsedConfigExports = {
	default?: ParsedInputWorkerConfig;
	settings?: ParsedInputSettingsConfig;
} & Record<string, ParsedInputContainerConfig | ParsedInputWorkerConfig>;

export type ConfigParseResult =
	| z.ZodSafeParseSuccess<ParsedConfigExports>
	| z.ZodSafeParseError<unknown>;

export interface LoadAndValidateConfigResult {
	/**
	 * Zod result for the parsed exports record, keyed by JS export name.
	 * Consumers format `result.error` themselves.
	 */
	result: ConfigParseResult;
	/** Transitive deps imported while resolving the config (node_modules excluded). */
	dependencies: Set<string>;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
	return typeof value === "object" && value !== null;
}

function isConfigReference(value: unknown): boolean {
	return typeof value === "function" || isRecord(value);
}

function normalizeConfigReference(
	reference: unknown,
	resolved: unknown,
	expectedType: "container" | "worker"
): unknown {
	return isRecord(resolved) &&
		resolved.type === expectedType &&
		typeof resolved.name === "string"
		? resolved.name
		: reference;
}

function createDefinitionResolver(ctx: ConfigContext): ResolveDefinition {
	const resolvedDefinitions = new Map<unknown, Promise<unknown>>();

	return (input) => {
		const cached = resolvedDefinitions.get(input);
		if (cached) {
			return cached;
		}

		const resolved = (async () => {
			const value =
				typeof input === "function"
					? (input as (ctx: ConfigContext) => unknown)(ctx)
					: input;
			return await value;
		})();
		resolvedDefinitions.set(input, resolved);
		return resolved;
	};
}

async function normalizeWorkerReferences(
	resolved: unknown,
	resolveDefinition: ResolveDefinition
): Promise<unknown> {
	if (!isRecord(resolved) || !isRecord(resolved.env)) {
		return resolved;
	}

	const env: Record<PropertyKey, unknown> = { ...resolved.env };
	for (const [bindingName, binding] of Object.entries(env)) {
		if (
			!isRecord(binding) ||
			typeof binding.type !== "string" ||
			!CROSS_WORKER_BINDING_TYPES.has(binding.type) ||
			!isConfigReference(binding.worker)
		) {
			continue;
		}

		const target = await resolveDefinition(binding.worker);
		env[bindingName] = {
			...binding,
			worker: normalizeConfigReference(binding.worker, target, "worker"),
		};
	}

	return { ...resolved, env };
}

async function normalizeContainerReferences(
	resolved: unknown,
	resolveDefinition: ResolveDefinition,
	resolvedExports: Record<string, unknown>
): Promise<NormalizeConfigReferencesResult> {
	const issues: z.core.$ZodIssue[] = [];
	if (!isRecord(resolved) || !isRecord(resolved.exports)) {
		return { value: resolved, issues };
	}

	const workerExports = { ...resolved.exports };
	for (const [exportName, workerExport] of Object.entries(workerExports)) {
		if (
			!isRecord(workerExport) ||
			workerExport.type !== "durable-object" ||
			workerExport.container === undefined
		) {
			continue;
		}

		const reference = workerExport.container;
		if (typeof reference === "string") {
			issues.push({
				code: "custom",
				input: reference,
				path: ["exports", exportName, "container"],
				message:
					"Container provided as a string. Reference an exported Container definition instead.",
			});
			workerExports[exportName] = { ...workerExport, container: undefined };
			continue;
		}

		const target = await resolveDefinition(reference);
		if (
			isRecord(target) &&
			target.type === "container" &&
			typeof target.name === "string" &&
			!Object.values(resolvedExports).includes(target)
		) {
			issues.push({
				code: "custom",
				input: reference,
				path: ["exports", exportName, "container"],
				message: `The referenced Container "${target.name}" is not exported.`,
			});
			workerExports[exportName] = { ...workerExport, container: undefined };
			continue;
		}

		workerExports[exportName] = {
			...workerExport,
			container: normalizeConfigReference(reference, target, "container"),
		};
	}

	return { value: { ...resolved, exports: workerExports }, issues };
}

async function normalizeConfigReferences(
	resolved: unknown,
	resolveDefinition: ResolveDefinition,
	resolvedExports: Record<string, unknown>
): Promise<NormalizeConfigReferencesResult> {
	const workerReferences = await normalizeWorkerReferences(
		resolved,
		resolveDefinition
	);
	return normalizeContainerReferences(
		workerReferences,
		resolveDefinition,
		resolvedExports
	);
}

function prefixIssues(
	issues: z.core.$ZodIssue[],
	prefix: PropertyKey
): z.core.$ZodIssue[] {
	return issues.map((issue) => ({
		...issue,
		path: [prefix, ...issue.path],
	}));
}

function validateUniqueResourceNames(
	configExports: ParsedConfigExports
): z.core.$ZodIssue[] {
	const issues: z.core.$ZodIssue[] = [];
	const exportNameByResourceName = {
		container: new Map<string, string>(),
		worker: new Map<string, string>(),
	};

	for (const [exportName, config] of Object.entries(configExports)) {
		if (config.type !== "container" && config.type !== "worker") {
			continue;
		}

		const resourceType = config.type === "container" ? "Container" : "Worker";
		const exportNames = exportNameByResourceName[config.type];
		const previousExportName = exportNames.get(config.name);
		if (previousExportName !== undefined) {
			issues.push({
				code: "custom",
				input: config.name,
				path: [exportName, "name"],
				message: `The ${resourceType} name "${config.name}" is also used by the "${previousExportName}" export. ${resourceType} names must be unique.`,
			});
			continue;
		}

		exportNames.set(config.name, exportName);
	}

	return issues;
}

function validateContainerExportLinks(
	configExports: ParsedConfigExports
): z.core.$ZodIssue[] {
	const issues: z.core.$ZodIssue[] = [];
	const containerNames = new Set<string>();

	for (const config of Object.values(configExports)) {
		if (config.type === "container") {
			containerNames.add(config.name);
		}
	}

	const firstReferenceByContainerName = new Map<
		string,
		{ workerExportName: string; durableObjectExportName: string }
	>();

	for (const [workerExportName, config] of Object.entries(configExports)) {
		if (config.type !== "worker") {
			continue;
		}

		for (const [durableObjectExportName, workerExport] of Object.entries(
			config.exports ?? {}
		)) {
			if (
				workerExport.type !== "durable-object" ||
				!("container" in workerExport) ||
				workerExport.container === undefined
			) {
				continue;
			}

			const containerName = workerExport.container;
			const path = [
				workerExportName,
				"exports",
				durableObjectExportName,
				"container",
			];

			if (!containerNames.has(containerName)) {
				issues.push({
					code: "custom",
					input: containerName,
					path,
					message: `The Container "${containerName}" is not exported from this configuration.`,
				});
				continue;
			}

			const firstReference = firstReferenceByContainerName.get(containerName);
			if (firstReference !== undefined) {
				issues.push({
					code: "custom",
					input: containerName,
					path,
					message: `The Container "${containerName}" is already referenced by "${firstReference.workerExportName}.exports.${firstReference.durableObjectExportName}". A Container can only be linked to one Durable Object.`,
				});
				continue;
			}

			firstReferenceByContainerName.set(containerName, {
				workerExportName,
				durableObjectExportName,
			});
		}
	}

	return issues;
}

/**
 * Resolve and validate loaded `cloudflare.config.ts` exports.
 *
 * Config inputs are resolved once by identity. Top-level Worker and Container
 * exports are also parsed once by identity. References are resolved only far
 * enough to replace them with resource names, then Container links are
 * validated across the exported resources.
 */
export async function resolveAndValidateConfigExports(
	exports: Record<string, unknown>,
	ctx: ConfigContext
): Promise<ConfigParseResult> {
	const resolveDefinition = createDefinitionResolver(ctx);
	const parsedResources = new Map<
		unknown,
		z.ZodSafeParseResult<ParsedInputContainerConfig | ParsedInputWorkerConfig>
	>();
	const resolvedExports: Record<string, unknown> = {};

	for (const [name, input] of Object.entries(exports)) {
		resolvedExports[name] = await resolveDefinition(input);
	}

	const typeResult = ConfigExportsTypeSchema.safeParse(resolvedExports);
	if (!typeResult.success) {
		return typeResult;
	}

	const issues: z.core.$ZodIssue[] = [];
	const data: ParsedConfigExports = {};

	const resolvedSettings = resolvedExports.settings;
	const settingsResult = resolvedSettings
		? InputSettingsSchema.safeParse(resolvedSettings)
		: undefined;
	if (settingsResult) {
		if (settingsResult.success) {
			data.settings = settingsResult.data;
		} else {
			issues.push(...prefixIssues(settingsResult.error.issues, "settings"));
		}
	}

	for (const [name, input] of Object.entries(exports)) {
		const resolved = resolvedExports[name];
		if (!isRecord(resolved)) {
			continue;
		}

		if (resolved.type !== "worker" && resolved.type !== "container") {
			continue;
		}

		let result = parsedResources.get(input);
		if (!result) {
			if (resolved.type === "worker") {
				const normalized = await normalizeConfigReferences(
					resolved,
					resolveDefinition,
					resolvedExports
				);
				issues.push(...prefixIssues(normalized.issues, name));
				result = InputWorkerSchema.safeParse(normalized.value);
			} else {
				result = InputContainerSchema.safeParse(resolved);
			}
			parsedResources.set(input, result);
			if (!result.success) {
				issues.push(...prefixIssues(result.error.issues, name));
			}
		}

		if (result.success) {
			data[name] = result.data;
		}
	}

	issues.push(
		...validateUniqueResourceNames(data),
		...validateContainerExportLinks(data)
	);

	return issues.length > 0
		? {
				success: false,
				error: new z.ZodError(issues),
			}
		: {
				success: true,
				data,
			};
}

/**
 * Load a `cloudflare.config.ts`, resolve all exports, and validate them.
 */
export async function loadAndValidateConfig(
	configPath: string,
	ctx: ConfigContext,
	options?: { include?: string[] }
): Promise<LoadAndValidateConfigResult> {
	const { exports, dependencies } = await loadConfig(configPath, options);
	const result = await resolveAndValidateConfigExports(exports, ctx);

	return { result, dependencies };
}
