import { existsSync } from "node:fs";
import path from "node:path";
import { loadConfig, resolveWorkerDefinition } from "@cloudflare/config";
import {
	ConfigSchema,
	convertToWranglerConfig,
} from "@cloudflare/deploy-helpers";
import { getCloudflareEnv, UserError } from "@cloudflare/workers-utils";
import { convertToolingConfig } from "./convert";
import {
	WORKER_CONFIG_FIELD_HINTS,
	WRANGLER_CONFIG_SUPPORTED_KEYS,
	WranglerConfigSchema,
} from "./schema";
import { resolveWranglerConfig } from "./wrangler-definition";
import type { ParsedWranglerConfig } from "./schema";
import type { RawConfig } from "@cloudflare/workers-utils";

export const CLOUDFLARE_CONFIG_FILENAME = "cloudflare.config.ts";
export const WRANGLER_CONFIG_FILENAME = "wrangler.config.ts";

export interface NormalizedTypes {
	generate: boolean;
}

export interface LoadNewConfigResult {
	/** Merged result: `cloudflare.config.ts` runtime + `wrangler.config.ts` tooling. */
	rawConfig: Omit<RawConfig, "env">;
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
 * Load and validate the new TypeScript-based configuration files.
 *
 * - `cloudflare.config.ts` is required.
 * - `wrangler.config.ts` is optional (defaults apply when missing).
 */
export async function loadNewConfig(options: {
	cwd: string;
	args: { env?: string };
}): Promise<LoadNewConfigResult> {
	const cwd = options.cwd;
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

	const mode = options.args.env ?? getCloudflareEnv();

	// ── Worker config ───────────────────────────────────────────────────
	const workerConfigResult = await loadConfig(cloudflareConfigPath);

	const resolvedWorkerConfig = await resolveWorkerDefinition(
		workerConfigResult.config,
		{ mode }
	);

	const parsedWorkerConfig = ConfigSchema.safeParse(resolvedWorkerConfig);
	if (!parsedWorkerConfig.success) {
		throw new UserError(
			`Invalid \`${CLOUDFLARE_CONFIG_FILENAME}\`:\n${formatZodError(parsedWorkerConfig.error)}`,
			{ telemetryMessage: "new-config worker validation failed" }
		);
	}

	// ── Wrangler (tooling) config ───────────────────────────────────────
	let wranglerConfigResult:
		| { config: unknown; dependencies: Set<string> }
		| undefined;
	let parsedWranglerConfig: { data: ParsedWranglerConfig } | undefined;

	if (wranglerConfigPath !== undefined) {
		wranglerConfigResult = await loadConfig(wranglerConfigPath);

		const resolvedWranglerConfig = await resolveWranglerConfig(
			wranglerConfigResult.config,
			{ mode }
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
	const rawWorkerConfig = convertToWranglerConfig(parsedWorkerConfig.data);

	const rawWranglerConfig = convertToolingConfig(
		parsedWranglerConfig?.data ?? {}
	);

	const rawConfig = mergeRawConfigs(rawWorkerConfig, rawWranglerConfig);

	// ── Normalised types ────────────────────────────────────────────────
	const types: NormalizedTypes = {
		generate: parsedWranglerConfig?.data.dev?.types?.generate ?? true,
	};

	// ── Dependencies (union of both files) ──────────────────────────────
	const dependencies = new Set(workerConfigResult.dependencies);
	if (wranglerConfigResult) {
		for (const dep of wranglerConfigResult.dependencies) {
			dependencies.add(dep);
		}
	}

	return {
		rawConfig,
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
 * `ConfigSchema.strictObject`). The only overlap is `assets`, where worker
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
