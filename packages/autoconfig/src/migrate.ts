/**
 * Migrate an existing Wrangler project (a `wrangler.jsonc` / `wrangler.json`)
 * to the new programmatic config format (`cloudflare.config.ts` + optional
 * `wrangler.config.ts`).
 *
 * This is a distinct flow from `runAutoConfig`: there is no framework
 * detection or package install — the project is already configured, we are
 * only translating its config to the new format with full fidelity via
 * `splitRawConfig`.
 *
 *   - Always writes `cloudflare.config.ts` (runtime config).
 *   - Writes `wrangler.config.ts` (tooling config) for non-Vite projects;
 *     Vite owns tooling, so Vite projects get `cloudflare.config.ts` only.
 *   - Removes the original `wrangler.jsonc` / `wrangler.json`.
 */
import { existsSync, readFileSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installPackages } from "@cloudflare/cli-shared-helpers/packages";
import { splitRawConfig } from "@cloudflare/config";
import { FatalError, parseJSONC } from "@cloudflare/workers-utils";
import {
	detectPackageManager,
	getWranglerJsonConfigPath,
	hasViteConfig,
} from "./config-module/fs-utils";
import {
	serializeCloudflareConfig,
	serializeWranglerConfig,
} from "./config-module/serialize";
import type { AutoConfigContext } from "./context";
import type { PackageJSON, RawConfig } from "@cloudflare/workers-utils";

export interface MigrateOptions {
	/** Project directory to migrate. */
	projectPath: string;
	/** Context providing logger / dialogs. */
	context: AutoConfigContext;
	/** Preview the changes without touching the filesystem. */
	dryRun?: boolean;
}

/**
 * Migrate a project's `wrangler.jsonc` to the new config format.
 *
 * @returns `true` if a Wrangler config was found and migrated (or previewed);
 *          `false` if there was nothing to migrate (no `wrangler.json[c]`).
 */
export async function migrateWranglerConfigToNewFormat(
	options: MigrateOptions
): Promise<boolean> {
	const { projectPath, context } = options;
	const { logger } = context;
	const dryRun = options.dryRun === true;

	const wranglerConfigPath = getWranglerJsonConfigPath(projectPath);
	if (wranglerConfigPath === undefined) {
		return false;
	}

	const raw = parseJSONC(
		await readFile(wranglerConfigPath, "utf8"),
		wranglerConfigPath
	) as RawConfig;

	if (raw.pages_build_output_dir) {
		throw new FatalError(
			"This project is a Cloudflare Pages project. Migrating Pages projects to the new config format is not supported.",
			{ telemetryMessage: "autoconfig migrate pages unsupported" }
		);
	}

	const isVite = hasViteConfig(projectPath);
	const { worker, tooling } = splitRawConfig(raw);
	const cloudflareConfig = serializeCloudflareConfig(worker);
	const hasTooling = Object.keys(tooling).length > 0;
	const writeToolingConfig = hasTooling && !isVite;

	// A migrated project is driven by `cf`, so we always add `cf` and rewrite
	// `wrangler ...` package.json scripts to `cf ...`.
	//
	// Whether `wrangler` itself is removed depends on who the build tool is:
	// `cf dev` / `cf build` delegate to an installed dev-server impl, and for
	// non-Vite projects that impl IS wrangler (via its `cf-wrangler`
	// delegate). Removing it there would leave the project with no build tool.
	// Vite projects use `@cloudflare/vite-plugin` as the impl, so `wrangler`
	// can be dropped. Hence: keep wrangler unless this is a Vite project.
	const removeWrangler = isVite;
	const pkg = readPackageJson(projectPath, removeWrangler);

	logger.log("");
	logger.log("Migrating to the new Cloudflare config format:");
	logger.log(" 📄 Create cloudflare.config.ts:");
	logger.log("  " + cloudflareConfig.replace(/\n/g, "\n  "));
	if (writeToolingConfig) {
		logger.log(" 📄 Create wrangler.config.ts:");
		logger.log("  " + serializeWranglerConfig(tooling).replace(/\n/g, "\n  "));
	} else if (hasTooling) {
		logger.warn(
			`These tooling settings are owned by Vite and were not migrated to a config file: ${Object.keys(
				tooling
			).join(", ")}. Configure them via the Cloudflare Vite plugin instead.`
		);
	}
	logger.log(` 🗑️  Remove ${wranglerConfigPath}`);
	if (pkg) {
		logger.log(
			removeWrangler
				? " 📦 Replace wrangler with cf (devDependency)"
				: " 📦 Add cf (devDependency; keeping wrangler as the build tool)"
		);
		if (Object.keys(pkg.rewrittenScripts).length > 0) {
			logger.log(" 📝 Update package.json scripts:");
			for (const [name, script] of Object.entries(pkg.rewrittenScripts)) {
				logger.log(`  - "${name}": "${script}"`);
			}
		}
	}
	logger.log("");

	if (dryRun) {
		logger.log("✋  Migration run in dry-run mode, exiting now.");
		logger.log("");
		return true;
	}

	await writeFile(
		resolve(projectPath, "cloudflare.config.ts"),
		cloudflareConfig
	);
	if (writeToolingConfig) {
		await writeFile(
			resolve(projectPath, "wrangler.config.ts"),
			serializeWranglerConfig(tooling)
		);
	}
	await rm(wranglerConfigPath, { force: true });

	if (pkg) {
		await writeFile(pkg.path, JSON.stringify(pkg.updated, null, 2) + "\n");
		await installPackages(detectPackageManager(projectPath), ["cf@latest"], {
			dev: true,
			startText: "Installing cf (the Cloudflare CLI)",
			doneText: "installed cf",
		});
	}

	logger.log("✓ Migrated project to the new Cloudflare config format.");
	logger.log("");
	return true;
}

/**
 * Read the project's `package.json` and compute the cf migration: each
 * `wrangler ...` script rewritten to `cf ...`, and (when `removeWrangler` is
 * `true`) `wrangler` removed from dependencies. `removeWrangler` is `false`
 * for non-Vite projects, where wrangler remains the build tool that
 * `cf dev` / `cf build` delegate to. Returns `undefined` if there is no
 * `package.json`.
 */
function readPackageJson(
	projectPath: string,
	removeWrangler: boolean
):
	| {
			path: string;
			updated: PackageJSON;
			rewrittenScripts: Record<string, string>;
	  }
	| undefined {
	const path = resolve(projectPath, "package.json");
	if (!existsSync(path)) {
		return undefined;
	}
	const pkg = JSON.parse(readFileSync(path, "utf8")) as PackageJSON;

	const rewrittenScripts: Record<string, string> = {};
	const scripts: Record<string, string> = {};
	for (const [name, script] of Object.entries(pkg.scripts ?? {})) {
		if (typeof script !== "string") {
			continue;
		}
		// Replace the `wrangler` command token (word-boundaried so package
		// names like `@cloudflare/wrangler-x` aren't touched) with `cf`.
		const rewritten = script.replace(/\bwrangler\b/g, "cf");
		scripts[name] = rewritten;
		if (rewritten !== script) {
			rewrittenScripts[name] = rewritten;
		}
	}

	const updated: PackageJSON = { ...pkg, scripts };
	if (removeWrangler) {
		for (const field of ["dependencies", "devDependencies"] as const) {
			const deps = updated[field];
			if (deps && "wrangler" in deps) {
				const { wrangler: _removed, ...rest } = deps;
				updated[field] = rest;
			}
		}
	}

	return { path, updated, rewrittenScripts };
}
