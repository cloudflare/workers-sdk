import path from "node:path";
import { fileExists } from "../../files";
import { ensureCleanGitWorktree } from "../../git";
import { convertWranglerConfig } from "./config-converter";
import { findSecretFiles, readWranglerConfig } from "./config-reader";
import {
	renderCloudflareConfig,
	renderWranglerConfig,
} from "./config-renderer";
import {
	cleanupMigrationOutputs,
	rewriteMigrationOutput,
	writeMigrationOutputs,
} from "./file-writer";
import { createFollowUp } from "./follow-ups";
import {
	DependencyInstallError,
	installProjectDependencies,
	planCfDependencyInstallation,
	planVitePluginDependencyUpgrade,
	planWranglerDependencyUpgrade,
} from "./install-dependencies";
import { MINIMUM_WRANGLER_VERSION } from "./wrangler-version";
import type { DependencyToInstall } from "./install-dependencies";
import type {
	MigrationFollowUp,
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

function formatDependencies(packages: string[]): string {
	const formatted = packages.map((packageName) => `\`${packageName}\``);
	if (formatted.length < 3) {
		return formatted.join(" and ");
	}
	return `${formatted.slice(0, -1).join(", ")} and ${formatted.at(-1)}`;
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
	const wranglerConfig = renderWranglerConfig(convertedConfig);
	const [cfDepPlan, wranglerDepPlan, vitePluginDepPlan] = await Promise.all([
		planCfDependencyInstallation(projectDirectory),
		planWranglerDependencyUpgrade(projectDirectory, wranglerConfig !== null),
		planVitePluginDependencyUpgrade(projectDirectory, bundler),
	]);
	const missingManifestPackages = formatDependencies([
		"cf@latest",
		...(bundler === "vite" ? ["@cloudflare/vite-plugin@beta"] : []),
	]);
	const dependenciesToInstall: DependencyToInstall[] = [];
	if (cfDepPlan.action === "install") {
		dependenciesToInstall.push({ dev: true, name: "cf", version: "latest" });
	}
	if (vitePluginDepPlan.action === "install") {
		dependenciesToInstall.push(vitePluginDepPlan.dependency);
	}
	if (wranglerDepPlan.action === "install") {
		dependenciesToInstall.push(wranglerDepPlan.dependency);
	}
	const dependencyNames = formatDependencies(
		dependenciesToInstall
			.filter(({ name }) => name !== "wrangler")
			.map(({ name, version }) => `${name}@${version}`)
	);
	if (cfDepPlan.action === "missing-manifest") {
		convertedConfig.followUps.push(
			createFollowUp(
				"cf-install-missing-manifest",
				`No package.json was found. Create or locate the package that owns this Worker, then install ${missingManifestPackages} as dev dependencies before using the generated configuration.`
			)
		);
	}
	if (cfDepPlan.action === "skipped-ancestor-package") {
		convertedConfig.followUps.push(
			createFollowUp(
				"cf-install-skipped",
				`An ancestor package.json was found, but it was not modified because it may belong to another project. Install ${missingManifestPackages} as dev dependencies in the package that owns this Worker.`
			)
		);
	}
	if (installDependencies && cfDepPlan.action === "unreadable-manifest") {
		const reason = cfDepPlan.reason
			? ` Package manifest error: ${cfDepPlan.reason}`
			: "";
		convertedConfig.followUps.push(
			createFollowUp(
				"cf-install-failed",
				`The local package.json could not be read, so migration dependencies could not be installed automatically. Resolve the reported package.json error, then install ${missingManifestPackages} before using the generated configuration.${reason}`
			)
		);
	}
	if (
		!installDependencies &&
		(cfDepPlan.action === "install" ||
			cfDepPlan.action === "unreadable-manifest" ||
			vitePluginDepPlan.action === "install")
	) {
		convertedConfig.followUps.push(
			createFollowUp(
				cfDepPlan.action === "install" ||
					cfDepPlan.action === "unreadable-manifest"
					? "cf-install-disabled"
					: "vite-plugin-install-disabled",
				`Automatic dependency installation was disabled. Install ${cfDepPlan.action === "unreadable-manifest" ? missingManifestPackages : dependencyNames} before using the generated configuration.`
			)
		);
	}
	if (wranglerDepPlan.action === "manual") {
		const instruction =
			wranglerDepPlan.workspaceDependency === "incompatible"
				? "Update the workspace Wrangler package and its lockfile while preserving the workspace dependency."
				: wranglerDepPlan.workspaceDependency === "unverified"
					? "Verify the workspace Wrangler package version and install workspace dependencies. Update the package and lockfile if needed while preserving the workspace dependency."
					: "Add `wrangler@latest` to the package that owns this Worker and update its lockfile.";
		convertedConfig.followUps.push(
			createFollowUp(
				"wrangler-upgrade-manual",
				`The generated wrangler.config.ts requires Wrangler ${MINIMUM_WRANGLER_VERSION} or newer. ${instruction}`
			)
		);
	}
	if (vitePluginDepPlan.action === "manual") {
		const instruction =
			vitePluginDepPlan.managedDependency === "incompatible"
				? "Update the project-managed plugin to a compatible v2 version and refresh its lockfile while preserving the dependency specifier."
				: "Install dependencies and verify that the project-managed plugin resolves to v2. If needed, update it and refresh the lockfile while preserving the dependency specifier.";
		convertedConfig.followUps.push(
			createFollowUp(
				"vite-plugin-upgrade-manual",
				`The Vite migration requires @cloudflare/vite-plugin v2. ${instruction}`
			)
		);
	}
	if (!installDependencies && wranglerDepPlan.action === "install") {
		convertedConfig.followUps.push(
			createFollowUp(
				"wrangler-upgrade-disabled",
				"Automatic dependency installation was disabled. Install `wrangler@latest` with your package manager before using the generated configuration."
			)
		);
	}
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
	let requiresInstall =
		cfDepPlan.action !== "already-installed" ||
		wranglerDepPlan.action !== "none" ||
		vitePluginDepPlan.action !== "none";

	await assertTargetsDoNotExist(Array.from(outputs.keys()));

	if (!dryRun) {
		await writeMigrationOutputs(outputs);
	}
	if (installDependencies && dependenciesToInstall.length > 0) {
		let dependencyFollowUp: MigrationFollowUp | undefined;
		try {
			const installResult = await installProjectDependencies(
				projectDirectory,
				dependenciesToInstall,
				{ dryRun }
			);
			changedFiles.push(...installResult.changedFiles);
			requiresInstall =
				installResult.requiresInstall ||
				wranglerDepPlan.action === "manual" ||
				vitePluginDepPlan.action === "manual";
		} catch (error) {
			if (dryRun) {
				throw error;
			}
			const pendingDependencies =
				error instanceof DependencyInstallError
					? error.pendingDependencies
					: dependenciesToInstall;
			if (error instanceof DependencyInstallError) {
				changedFiles.push(...error.changedFiles);
			}
			if (
				error instanceof DependencyInstallError &&
				error.stage !== "install"
			) {
				dependencyFollowUp =
					error.stage === "lockfile-sync"
						? createFollowUp(
								"vite-plugin-lockfile-sync-failed",
								`The Vite plugin was installed and package.json now declares \`beta\`, but the lockfile could not be synchronized. Run your package manager's install command to refresh it before using the generated configuration. ${error.message}`
							)
						: createFollowUp(
								"vite-plugin-manifest-update-failed",
								`The Vite plugin was installed, but package.json could not be set to the \`beta\` dist tag. Set it to \`beta\` and run your package manager's install command before using the generated configuration. ${error.message}`
							);
			} else {
				const reason =
					error instanceof Error
						? ` Installation failed: ${error.message}`
						: "";
				const packageNames = formatDependencies(
					pendingDependencies.map(({ name }) => name)
				);
				const packageSpecifiers = formatDependencies(
					pendingDependencies.map(({ name, version }) => `${name}@${version}`)
				);
				dependencyFollowUp = createFollowUp(
					pendingDependencies.some(({ name }) => name === "cf")
						? "cf-install-failed"
						: pendingDependencies.some(({ name }) => name === "wrangler")
							? "wrangler-upgrade-failed"
							: "vite-plugin-install-failed",
					`The generated configuration was written, but ${packageNames} could not be installed automatically. Install ${packageSpecifiers} with your package manager before using it.${reason}`
				);
			}
			requiresInstall = true;
		}

		if (dependencyFollowUp) {
			followUps.push(dependencyFollowUp);
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
	}

	return {
		changedFiles: changedFiles.map((filePath) =>
			path.relative(projectDirectory, filePath)
		),
		followUps,
		requiresInstall,
		status: followUps.some(({ blocking }) => blocking)
			? "needs-intervention"
			: "complete",
	};
}
