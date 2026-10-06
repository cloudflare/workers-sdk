import { existsSync } from "node:fs";
import {
	convertToWranglerConfig,
	loadAndParseConfig,
} from "@cloudflare/config";
import {
	formatZodError,
	normalizeAndValidateConfig,
} from "@cloudflare/workers-utils";
import type { Config, RawConfig } from "@cloudflare/workers-utils";

export const NEW_CONFIG_FILENAME = "cloudflare.config.ts";

/**
 * Load a `cloudflare.config.ts` and normalise it into the same `Config` shape
 * that `wrangler.unstable_readConfig()` produces for a Wrangler configuration
 * file, so that everything downstream (bindings, remote proxy sessions,
 * `unstable_getMiniflareWorkerOptions()`) is oblivious to which config format
 * the project uses.
 *
 * This mirrors the `@cloudflare/vite-plugin` implementation of
 * `experimental.newConfig`: load and parse via `@cloudflare/config`, convert
 * the result to a Wrangler `RawConfig`, then run it through the standard
 * Wrangler normalisation/validation pipeline.
 *
 * @param configPath Absolute path to the `cloudflare.config.ts` file.
 * @param mode The Vite mode, passed to config functions as `ctx.mode`.
 * @returns The normalised config.
 */
export async function loadNewConfig(
	configPath: string,
	mode: string | undefined
): Promise<Config> {
	if (!existsSync(configPath)) {
		throw new TypeError(
			`\`experimental.newConfig\` is enabled but no \`${NEW_CONFIG_FILENAME}\` was found at ${configPath}.`
		);
	}

	const { result } = await loadAndParseConfig(configPath, {
		isPreview: false,
		mode,
	});

	if (!result.success) {
		throw new TypeError(
			`Invalid \`${NEW_CONFIG_FILENAME}\`:\n${formatZodError(result.error)}`
		);
	}

	const worker = result.data.worker;

	if (worker === undefined) {
		throw new TypeError(
			`\`${NEW_CONFIG_FILENAME}\` must define a Worker using the \`worker\` property.`
		);
	}

	const rawConfig: RawConfig = convertToWranglerConfig(result.data);

	// Passing `configPath` as both the config path and the user config path
	// resolves `main` relative to the config file's directory, and lets
	// `unstable_getMiniflareWorkerOptions()` derive the Worker's `rootPath` from
	// that same directory — matching how a Wrangler configuration file behaves.
	const { config, diagnostics } = normalizeAndValidateConfig(
		rawConfig,
		configPath,
		configPath,
		{}
	);

	if (diagnostics.hasWarnings()) {
		console.warn(diagnostics.renderWarnings());
	}

	if (diagnostics.hasErrors()) {
		throw new TypeError(diagnostics.renderErrors());
	}

	return config;
}
