import * as z from "zod";
import { loadConfig } from "./load";
import {
	ConfigExportsTypeSchema,
	InputSettingsSchema,
	InputWorkerSchema,
} from "./schema";
import type { ConfigContext } from "./definition";
import type {
	ParsedInputSettingsConfig,
	ParsedInputWorkerConfig,
} from "./schema";

const CROSS_WORKER_BINDING_TYPES = new Set([
	"durable-object",
	"worker",
	"workflow",
]);

type ResolveDefinition = (input: unknown) => Promise<unknown>;

export type ParsedConfigExports = {
	settings?: ParsedInputSettingsConfig;
} & Record<string, ParsedInputWorkerConfig>;

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
			worker: isRecord(target) ? target.name : undefined,
		};
	}

	return { ...resolved, env };
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

/**
 * Resolve and validate loaded `cloudflare.config.ts` exports.
 *
 * Config inputs are resolved once by identity. Top-level Worker exports are
 * also parsed once by identity; unexported references are resolved only far
 * enough to replace the reference with the Worker's name.
 */
export async function resolveAndValidateConfigExports(
	exports: Record<string, unknown>,
	ctx: ConfigContext
): Promise<ConfigParseResult> {
	const resolveDefinition = createDefinitionResolver(ctx);
	const parsedWorkers = new Map<
		unknown,
		z.ZodSafeParseResult<ParsedInputWorkerConfig>
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

		if (resolved.type === "worker") {
			let result = parsedWorkers.get(input);
			if (!result) {
				result = InputWorkerSchema.safeParse(
					await normalizeWorkerReferences(resolved, resolveDefinition)
				);
				parsedWorkers.set(input, result);
				if (!result.success) {
					issues.push(...prefixIssues(result.error.issues, name));
				}
			}

			if (result.success) {
				data[name] = result.data;
			}
			continue;
		}
	}

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
