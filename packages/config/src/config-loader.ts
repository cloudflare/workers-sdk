import * as z from "zod";
import { loadConfig } from "./load";
import { InputConfigSchema, InputSettingsSchema } from "./schema";
import type { ConfigContext } from "./definition";
import type { ParsedInputConfig, ParsedInputSettingsConfig } from "./schema";

const CROSS_WORKER_BINDING_TYPES = new Set([
	"durable-object",
	"worker",
	"workflow",
]);

type ResolveDefinition = (input: unknown) => Promise<unknown>;

interface NormalizeWorkerResult {
	value: unknown;
	issues: z.core.$ZodIssue[];
}

export type ConfigParseResult =
	| z.ZodSafeParseSuccess<ParsedInputConfig>
	| z.ZodSafeParseError<unknown>;

export type ConfigSettingsParseResult =
	| z.ZodSafeParseSuccess<ParsedInputSettingsConfig>
	| z.ZodSafeParseError<unknown>;

export interface LoadAndParseConfigResult {
	/** Zod result for the parsed configuration. */
	result: ConfigParseResult;
	/** Transitive deps imported while resolving the config (node_modules excluded). */
	dependencies: Set<string>;
}

export interface LoadAndParseConfigSettingsResult {
	/** Zod result containing only account and compliance settings. */
	result: ConfigSettingsParseResult;
	/** Transitive deps imported while resolving the config (node_modules excluded). */
	dependencies: Set<string>;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
	return typeof value === "object" && value !== null;
}

function normalizeConfigReference(
	reference: unknown,
	resolved: unknown
): unknown {
	return isRecord(resolved) && typeof resolved.name === "string"
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
			typeof binding.worker === "string" ||
			binding.worker === undefined
		) {
			continue;
		}

		const target = await resolveDefinition(binding.worker);
		env[bindingName] = {
			...binding,
			worker: normalizeConfigReference(binding.worker, target),
		};
	}

	return { ...resolved, env };
}

function normalizeWorkerEntrypoint(resolved: unknown): unknown {
	if (
		!isRecord(resolved) ||
		!isRecord(resolved.entrypoint) ||
		!("default" in resolved.entrypoint)
	) {
		return resolved;
	}

	return { ...resolved, entrypoint: resolved.entrypoint.default };
}

async function normalizeContainerReferences(
	resolved: unknown,
	resolveDefinition: ResolveDefinition,
	containers: unknown[]
): Promise<NormalizeWorkerResult> {
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
					"Container provided as a string. Reference a Container definition instead, for example `container: myContainer`.",
			});
			workerExports[exportName] = { ...workerExport, container: undefined };
			continue;
		}

		const target = await resolveDefinition(reference);
		if (
			isRecord(target) &&
			typeof target.name === "string" &&
			!containers.includes(target)
		) {
			issues.push({
				code: "custom",
				input: reference,
				path: ["exports", exportName, "container"],
				message: `The referenced Container "${target.name}" is not included in the \`containers\` array.`,
			});
			workerExports[exportName] = { ...workerExport, container: undefined };
			continue;
		}

		workerExports[exportName] = {
			...workerExport,
			container: normalizeConfigReference(reference, target),
		};
	}

	return { value: { ...resolved, exports: workerExports }, issues };
}

async function normalizeWorkerConfig(
	resolved: unknown,
	resolveDefinition: ResolveDefinition,
	containers: unknown[]
): Promise<NormalizeWorkerResult> {
	const partiallyNormalizedConfig = await normalizeWorkerReferences(
		normalizeWorkerEntrypoint(resolved),
		resolveDefinition
	);
	return normalizeContainerReferences(
		partiallyNormalizedConfig,
		resolveDefinition,
		containers
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

function validateUniqueContainerNames(
	config: ParsedInputConfig
): z.core.$ZodIssue[] {
	const issues: z.core.$ZodIssue[] = [];
	const firstIndexByName = new Map<string, number>();

	for (const [index, container] of config.containers.entries()) {
		const firstIndex = firstIndexByName.get(container.name);
		if (firstIndex !== undefined) {
			issues.push({
				code: "custom",
				input: container.name,
				path: ["containers", index, "name"],
				message: `The Container name "${container.name}" is also used by \`containers[${firstIndex}]\`. Container names must be unique.`,
			});
			continue;
		}

		firstIndexByName.set(container.name, index);
	}

	return issues;
}

function validateContainerLinks(config: ParsedInputConfig): z.core.$ZodIssue[] {
	const issues: z.core.$ZodIssue[] = [];
	const firstExportByContainerName = new Map<string, string>();

	for (const [exportName, workerExport] of Object.entries(
		config.worker?.exports ?? {}
	)) {
		if (
			workerExport.type !== "durable-object" ||
			!("container" in workerExport) ||
			workerExport.container === undefined
		) {
			continue;
		}

		const containerName = workerExport.container;
		const firstExportName = firstExportByContainerName.get(containerName);
		if (firstExportName !== undefined) {
			issues.push({
				code: "custom",
				input: containerName,
				path: ["worker", "exports", exportName, "container"],
				message: `The Container "${containerName}" is already referenced by \`worker.exports.${firstExportName}\`. A Container can only be linked to one Durable Object.`,
			});
			continue;
		}

		firstExportByContainerName.set(containerName, exportName);
	}

	return issues;
}

/** Resolve and parse the default configuration export. */
export async function resolveAndParseConfig(
	input: unknown,
	ctx: ConfigContext
): Promise<ConfigParseResult> {
	const resolveDefinition = createDefinitionResolver(ctx);
	const resolved = await resolveDefinition(input);
	if (!isRecord(resolved)) {
		return InputConfigSchema.safeParse(resolved);
	}

	const containerInputs = Array.isArray(resolved.containers)
		? resolved.containers
		: [];
	const containers = await Promise.all(
		containerInputs.map((container) => resolveDefinition(container))
	);
	const normalizedWorker =
		resolved.worker === undefined
			? { value: undefined, issues: [] }
			: await normalizeWorkerConfig(
					await resolveDefinition(resolved.worker),
					resolveDefinition,
					containers
				);
	const candidate = {
		...resolved,
		...(resolved.worker === undefined
			? {}
			: { worker: normalizedWorker.value }),
		...(Array.isArray(resolved.containers) ? { containers } : {}),
	};
	const result = InputConfigSchema.safeParse(candidate);
	const issues = [...prefixIssues(normalizedWorker.issues, "worker")];

	if (!result.success) {
		issues.push(...result.error.issues);
	} else {
		issues.push(
			...validateUniqueContainerNames(result.data),
			...validateContainerLinks(result.data)
		);
	}

	return issues.length > 0
		? { success: false, error: new z.ZodError(issues) }
		: result;
}

/** Resolve and parse only the account settings in a configuration definition. */
export async function resolveAndParseConfigSettings(
	input: unknown,
	ctx: ConfigContext
): Promise<ConfigSettingsParseResult> {
	const resolved = await createDefinitionResolver(ctx)(input);
	return InputSettingsSchema.safeParse(resolved);
}

/** Load and parse `cloudflare.config.ts`'s default export. */
export async function loadAndParseConfig(
	configPath: string,
	ctx: ConfigContext
): Promise<LoadAndParseConfigResult> {
	const { config, dependencies } = await loadConfig(configPath);
	const result = await resolveAndParseConfig(config, ctx);
	return { result, dependencies };
}

/** Load and parse only account settings from the default export. */
export async function loadAndParseConfigSettings(
	configPath: string,
	ctx: ConfigContext
): Promise<LoadAndParseConfigSettingsResult> {
	const { config, dependencies } = await loadConfig(configPath);
	const result = await resolveAndParseConfigSettings(config, ctx);
	return { result, dependencies };
}
