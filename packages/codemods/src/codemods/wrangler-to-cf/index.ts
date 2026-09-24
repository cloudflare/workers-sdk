import path from "node:path";
import { fileExists } from "../../files";
import { ensureCleanGitWorktree } from "../../git";
import { convertWranglerConfig } from "./config-converter";
import { findSecretFiles, readWranglerConfig } from "./config-reader";
import {
	renderCloudflareConfig,
	renderWranglerConfig,
} from "./config-renderer";
import { writeMigrationOutputs } from "./file-writer";
import { createFollowUp } from "./follow-ups";
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
	if (!dryRun) {
		await ensureCleanGitWorktree(projectDirectory, force);
	}

	const [rawConfig, secretFiles] = await Promise.all([
		readWranglerConfig(absoluteConfigPath),
		findSecretFiles(projectDirectory),
	]);
	const convertedConfig = convertWranglerConfig(
		rawConfig,
		bundler,
		secretFiles
	);
	const followUps = [...convertedConfig.followUps];
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
	const changedFiles = Array.from(outputs.keys());

	await assertTargetsDoNotExist(Array.from(outputs.keys()));

	if (wranglerConfig) {
		assertCompatibleWranglerVersion(projectDirectory);
	}
	if (!dryRun) {
		await writeMigrationOutputs(outputs);
	}
	if (installDependencies) {
		try {
			const installResult = await installCfDependency(projectDirectory, {
				dryRun,
			});
			changedFiles.push(...installResult.changedFiles);
			if (installResult.status === "skipped-ancestor-package") {
				followUps.push(
					createFollowUp(
						"cf-install-skipped",
						"An ancestor package.json was found, but it was not modified because it may belong to another project. Install `cf@latest` as a dev dependency in the package that owns this Worker."
					)
				);
			}
		} catch (error) {
			if (dryRun) {
				throw error;
			}
			const reason =
				error instanceof Error ? ` Installation failed: ${error.message}` : "";
			followUps.push(
				createFollowUp(
					"cf-install-failed",
					`The generated configuration was written, but \`cf\` could not be installed automatically. Install \`cf@latest\` as a dev dependency with your package manager before using it.${reason}`
				)
			);
		}
	}

	return {
		changedFiles: changedFiles.map((filePath) =>
			path.relative(projectDirectory, filePath)
		),
		followUps,
		status: followUps.some(({ blocking }) => blocking)
			? "needs-intervention"
			: "complete",
	};
}
