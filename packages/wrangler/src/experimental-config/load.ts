import { existsSync } from "node:fs";
import path from "node:path";
import {
	convertToWranglerConfig,
	loadAndParseConfig,
	loadConfig,
} from "@cloudflare/config";
import { getCloudflareEnv, UserError } from "@cloudflare/workers-utils";
import { convertToolingConfig } from "./convert";
import {
	WORKER_CONFIG_FIELD_HINTS,
	WRANGLER_CONFIG_SUPPORTED_KEYS,
	WranglerConfigSchema,
} from "./schema";
import { resolveWranglerConfig } from "./wrangler-definition";
import type { ParsedWranglerConfig } from "./schema";
import type {
	ParsedInputConfig,
	ParsedInputWorkerConfig,
} from "@cloudflare/config";
import type { RawConfig } from "@cloudflare/workers-utils";

export const CLOUDFLARE_CONFIG_FILENAME = "cloudflare.config.ts";
export const WRANGLER_CONFIG_FILENAME = "wrangler.config.ts";

export interface NormalizedTypes {
	generate: boolean;
	includeRuntime: boolean;
}

export type ParsedProjectConfig = ParsedInputConfig & {
	worker: ParsedInputWorkerConfig;
};

export interface LoadNewConfigResult {
	/** Merged result: `cloudflare.config.ts` runtime + `wrangler.config.ts` tooling. */
	rawConfig: Omit<RawConfig, "env">;
	/** Validated project configuration grouped by resource type. */
	parsedConfig: ParsedProjectConfig;
	/**
	 * The mode the config was resolved in, from `--mode`/`--env` or
	 * `CLOUDFLARE_ENV`. `undefined` when no mode was selected.
	 */
	mode: string | undefined;
	/** Resolved absolute path to `cloudflare.config.ts`. */
	cloudflareConfigPath: string;
	/** Resolved absolute path to `wrangler.config.ts`, if present. */
	wranglerConfigPath: string | undefined;
	/** Transitive deps from BOTH files (node_modules excluded). */
	dependencies: Set<string>;
	/** Normalized type-generation settings. */
	types: NormalizedTypes;
}

/**
 * Load and parse the new TypeScript-based configuration files.
 *
 * - `cloudflare.config.ts` is required.
 * - `wrangler.config.ts` is optional (defaults apply when missing).
 */
export async function loadNewConfig(options: {
	cwd: string;
	args: { env?: string };
	isPreview?: boolean;
}): Promise<LoadNewConfigResult> {
	const { cwd, args, isPreview = false } = options;
	const cloudflareConfigPath = path.resolve(cwd, CLOUDFLARE_CONFIG_FILENAME);
	if (!existsSync(cloudflareConfigPath)) {
		throw new UserError(
			`${CLOUDFLARE_CONFIG_FILENAME} is required when --experimental-new-config is enabled.`,
			{ telemetryMessage: "new-config worker config file missing" }
		);
	}

	const candidateWranglerConfigPath = path.resolve(
		cwd,
		WRANGLER_CONFIG_FILENAME
	);
	const wranglerConfigPath = existsSync(candidateWranglerConfigPath)
		? candidateWranglerConfigPath
		: undefined;

	const mode = args.env ?? getCloudflareEnv();

	// ── Cloudflare config ───────────────────────────────────────────────
	const configResult = await loadAndParseConfig(cloudflareConfigPath, {
		isPreview,
		mode,
	});

	if (!configResult.result.success) {
		throw new UserError(
			`Invalid \`${CLOUDFLARE_CONFIG_FILENAME}\`:\n${formatZodError(configResult.result.error)}`,
			{ telemetryMessage: "new-config worker validation failed" }
		);
	}

	if (configResult.result.data.worker === undefined) {
		throw new UserError(
			`\`${CLOUDFLARE_CONFIG_FILENAME}\` must define a Worker using the \`worker\` property.`,
			{ telemetryMessage: "new-config worker missing" }
		);
	}

	const parsedConfig: ParsedProjectConfig = {
		...configResult.result.data,
		worker: configResult.result.data.worker,
	};

	// ── Wrangler (tooling) config ───────────────────────────────────────
	let wranglerConfigResult: Awaited<ReturnType<typeof loadConfig>> | undefined;
	let parsedWranglerConfig: { data: ParsedWranglerConfig } | undefined;

	if (wranglerConfigPath !== undefined) {
		wranglerConfigResult = await loadConfig(wranglerConfigPath);

		const resolvedWranglerConfig = await resolveWranglerConfig(
			wranglerConfigResult.config,
			{ isPreview, mode }
		);

		const parsed = WranglerConfigSchema.safeParse(resolvedWranglerConfig);
		if (!parsed.success) {
			throw new UserError(
				`Invalid \`${WRANGLER_CONFIG_FILENAME}\`:\n${formatWranglerConfigZodError(parsed.error)}`,
				{ telemetryMessage: "new-config tooling validation failed" }
			);
		}
		parsedWranglerConfig = { data: parsed.data };
	}

	// ── Conversion + merge ──────────────────────────────────────────────
	const rawWorkerConfig: RawConfig = convertToWranglerConfig(parsedConfig);

	const rawWranglerConfig = convertToolingConfig(
		parsedWranglerConfig?.data ?? {}
	);

	const rawConfig = mergeRawConfigs(rawWorkerConfig, rawWranglerConfig);

	// ── Normalised types ────────────────────────────────────────────────
	const types: NormalizedTypes = {
		generate: parsedWranglerConfig?.data.types?.generate ?? true,
		includeRuntime: parsedWranglerConfig?.data.types?.includeRuntime ?? true,
	};

	// ── Dependencies (union of both files) ──────────────────────────────
	const dependencies = new Set(configResult.dependencies);
	if (wranglerConfigResult) {
		for (const dep of wranglerConfigResult.dependencies) {
			dependencies.add(dep);
		}
	}

	return {
		rawConfig,
		parsedConfig,
		mode,
		cloudflareConfigPath,
		wranglerConfigPath,
		dependencies,
		types,
	};
}

/**
 * Merge the converted Worker `RawConfig` (from `convertToWranglerConfig`)
 * with the converted tooling `Partial<RawConfig>` (from
 * `convertToolingConfig`).
 *
 * Worker fields cannot appear in tooling (rejected by `WranglerConfigSchema`).
 * Tooling fields cannot appear in worker (rejected by `@cloudflare/config`'s
 * `InputWorkerSchema.strictObject`). The only overlap is `assets`, where worker
 * carries `binding`/`html_handling`/`not_found_handling`/`run_worker_first`
 * and tooling carries `directory` (sourced from the flat top-level
 * `assetsDirectory` field on `wrangler.config.ts`).
 */
export function mergeRawConfigs(
	worker: RawConfig,
	tooling: Partial<RawConfig>
): RawConfig {
	const { assets: workerAssets, ...workerRest } = worker;
	const { assets: toolingAssets, ...toolingRest } = tooling;

	const assets =
		workerAssets || toolingAssets
			? { ...workerAssets, ...toolingAssets }
			: undefined;

	return {
		...workerRest,
		...toolingRest,
		...(assets !== undefined ? { assets } : {}),
	};
}

interface ZodLikeIssue {
	path: PropertyKey[];
	message: string;
	code?: string;
	keys?: string[];
}
interface ZodLikeError {
	issues: ZodLikeIssue[];
	message?: string;
}

function dottedPath(issuePath: PropertyKey[]): string {
	return issuePath.filter((p) => typeof p !== "symbol").join(".");
}

function formatZodError(err: ZodLikeError): string {
	if (!err.issues || err.issues.length === 0) {
		return err.message ?? "Unknown validation error";
	}
	return err.issues
		.map((issue) => {
			const dotted = dottedPath(issue.path);
			return dotted
				? `  • ${dotted}: ${issue.message}`
				: `  • ${issue.message}`;
		})
		.join("\n");
}

function formatWranglerConfigZodError(err: ZodLikeError): string {
	if (!err.issues || err.issues.length === 0) {
		return err.message ?? "Unknown validation error";
	}
	return err.issues
		.map((issue) => {
			const dotted = dottedPath(issue.path);
			// Augment "unrecognized key" issues with a hint pointing at
			// cloudflare.config.ts when the offending key is a Worker-runtime field.
			if (issue.code === "unrecognized_keys" && Array.isArray(issue.keys)) {
				return issue.keys
					.map((key) => {
						const fullPath = dotted ? `${dotted}.${key}` : key;
						if (WORKER_CONFIG_FIELD_HINTS.has(key)) {
							return `  • ${fullPath} is not a supported field in ${WRANGLER_CONFIG_FILENAME}. Move it to ${CLOUDFLARE_CONFIG_FILENAME}.`;
						}
						return `  • ${fullPath} is not a supported field. Supported top-level fields are: ${WRANGLER_CONFIG_SUPPORTED_KEYS.join(", ")}.`;
					})
					.join("\n");
			}
			return dotted
				? `  • ${dotted}: ${issue.message}`
				: `  • ${issue.message}`;
		})
		.join("\n");
}
