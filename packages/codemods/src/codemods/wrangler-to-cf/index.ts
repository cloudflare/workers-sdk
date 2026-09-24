import { access } from "node:fs/promises";
import path from "node:path";
import { ensureCleanGitWorktree } from "../../git";
import { convertWranglerConfig } from "./config-converter";
import { findSecretFiles, readWranglerConfig } from "./config-reader";
import {
	renderCloudflareConfig,
	renderWranglerConfig,
} from "./config-renderer";
import { writeMigrationOutputs } from "./file-writer";
import { installCfDependency } from "./install-dependencies";
import { assertCompatibleWranglerVersion } from "./wrangler-version";
import type {
	WranglerToCfMigrationOptions,
	WranglerToCfMigrationResult,
} from "./types";

export type {
	MigrationFollowUp,
	WranglerToCfMigrationOptions,
	WranglerToCfMigrationResult,
} from "./types";

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return false;
		}

		throw error;
	}
}

async function assertTargetsDoNotExist(filePaths: string[]): Promise<void> {
	const targetsExist = await Promise.all(filePaths.map(fileExists));
	const existingTarget = filePaths.find((_, index) => targetsExist[index]);
	if (existingTarget === undefined) {
		return;
	}

	throw new Error(
		`Cannot migrate because ${existingTarget} already exists. Inspect and finish the existing migration; it will not be overwritten. Automated agents should read its TODOs and ask the user about unresolved choices.`
	);
}

/**
 * Migrates one exact Wrangler configuration file to the new cf configuration.
 *
 * @param configPath Path to a Wrangler JSON, JSONC, or TOML configuration file.
 * @param options Optional bundler selection and write-safety controls.
 *
 * @returns Generated file paths and any follow-up work left for the caller.
 */
export async function migrateWranglerToCf(
	configPath: string,
	options: WranglerToCfMigrationOptions = {}
): Promise<WranglerToCfMigrationResult> {
	const {
		bundler = "vite",
		dryRun = false,
		force = false,
		installDependencies = true,
	} = options;

	const absoluteConfigPath = path.resolve(configPath);
	const projectDirectory = path.dirname(absoluteConfigPath);
	const cloudflareConfigPath = path.join(
		projectDirectory,
		"cloudflare.config.ts"
	);

	await assertTargetsDoNotExist([cloudflareConfigPath]);
	await ensureCleanGitWorktree(projectDirectory, force);

	const [rawConfig, secretFiles] = await Promise.all([
		readWranglerConfig(absoluteConfigPath),
		findSecretFiles(projectDirectory),
	]);
	const convertedConfig = convertWranglerConfig(
		rawConfig,
		bundler,
		secretFiles
	);
	const cloudflareConfig = renderCloudflareConfig(convertedConfig);
	const wranglerConfig = renderWranglerConfig(convertedConfig);

	const outputs = new Map<string, string>([
		[cloudflareConfigPath, cloudflareConfig],
	]);
	if (wranglerConfig) {
		outputs.set(
			path.join(projectDirectory, "wrangler.config.ts"),
			wranglerConfig
		);
	}

	await assertTargetsDoNotExist(Array.from(outputs.keys()));

	if (!dryRun) {
		if (wranglerConfig) {
			assertCompatibleWranglerVersion(projectDirectory);
		}
		if (installDependencies) {
			await installCfDependency(projectDirectory);
		}
		await writeMigrationOutputs(outputs);
	}

	return {
		changedFiles: Array.from(outputs.keys()).map((filePath) =>
			path.relative(projectDirectory, filePath)
		),
		followUps: convertedConfig.followUps,
		status: convertedConfig.followUps.some(({ blocking }) => blocking)
			? "needs-intervention"
			: "complete",
	};
}
