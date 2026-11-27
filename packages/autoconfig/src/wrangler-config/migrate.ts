import path from "node:path";
import {
	renderCloudflareConfig,
	renderWranglerConfig,
} from "../cloudflare-config/render";
import {
	cleanupMigrationOutputs,
	rewriteMigrationOutput,
	writeMigrationOutputs,
} from "../cloudflare-config/write";
import {
	installPlannedDependencies,
	planProjectDependencies,
} from "../dependencies/install";
import { fileExists } from "../file-exists";
import { CF_VITE_PLUGIN_VERSION_RANGE } from "../frameworks/utils/vite-plugin-version";
import { convertWranglerConfig } from "./convert";
import { findSecretFiles, readWranglerConfig } from "./read";
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
export async function migrateWranglerConfig(
	configPath: string,
	options: WranglerToCfMigrationOptions = {}
): Promise<WranglerToCfMigrationResult> {
	const {
		bundler = "vite",
		dryRun = false,
		installDependencies = true,
	} = options;
	if (bundler !== "vite" && bundler !== "wrangler") {
		throw new Error(
			`Unsupported bundler "${String(bundler)}". Expected "vite" or "wrangler".`
		);
	}

	const absoluteConfigPath = path.resolve(configPath);
	const projectDirectory = path.dirname(absoluteConfigPath);
	const cloudflareConfigPath = path.join(
		projectDirectory,
		"cloudflare.config.ts"
	);

	await assertTargetsDoNotExist([cloudflareConfigPath]);

	const [rawConfig, secretFiles] = await Promise.all([
		readWranglerConfig(absoluteConfigPath),
		findSecretFiles(projectDirectory),
	]);
	const convertedConfig = convertWranglerConfig(
		rawConfig,
		bundler,
		secretFiles
	);
	const wranglerConfig = renderWranglerConfig(convertedConfig);
	const dependencyPlan = await planProjectDependencies(
		projectDirectory,
		[
			{ name: "cf", version: "latest", dev: true },
			...(bundler === "vite"
				? [
						{
							name: "@cloudflare/vite-plugin",
							version: CF_VITE_PLUGIN_VERSION_RANGE,
							dev: true,
						},
					]
				: []),
			...(wranglerConfig !== null ? [{ name: "wrangler", dev: true }] : []),
		],
		{ installDependencies }
	);
	convertedConfig.followUps.push(...dependencyPlan.followUps);
	const followUps = [...convertedConfig.followUps];
	const cloudflareConfig = renderCloudflareConfig(convertedConfig);

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

	if (!dryRun) {
		await writeMigrationOutputs(outputs);
	}
	const installOutcome = await installPlannedDependencies(
		projectDirectory,
		dependencyPlan,
		{ dryRun }
	);
	changedFiles.push(...installOutcome.changedFiles);
	if (installOutcome.followUp) {
		followUps.push(installOutcome.followUp);
		const updatedCloudflareConfig = renderCloudflareConfig({
			...convertedConfig,
			followUps,
		});
		outputs.set(cloudflareConfigPath, updatedCloudflareConfig);
		try {
			await rewriteMigrationOutput(
				cloudflareConfigPath,
				updatedCloudflareConfig
			);
		} catch (error) {
			await cleanupMigrationOutputs(outputs.keys(), error);
		}
	}

	return {
		changedFiles: changedFiles.map((filePath) =>
			path.relative(projectDirectory, filePath)
		),
		followUps,
		requiresInstall: installOutcome.requiresInstall,
		status: followUps.some(({ blocking }) => blocking)
			? "needs-intervention"
			: "complete",
	};
}
