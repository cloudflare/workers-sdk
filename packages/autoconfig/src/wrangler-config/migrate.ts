import { readFile } from "node:fs/promises";
import path from "node:path";
import { ensureCleanGitWorktree } from "@cloudflare/cli-shared-helpers/git";
import {
	addMigrationTodos,
	renderCloudflareConfig,
	renderWranglerConfig,
} from "../cloudflare-config/render";
import {
	cleanupMigrationOutputs,
	rewriteMigrationOutput,
	writeMigrationOutputs,
} from "../cloudflare-config/write";
import {
	DependencyInstallError,
	installProjectDependencies,
	planCfDependencyInstallation,
	planVitePluginDependencyUpgrade,
	planWranglerDependencyUpgrade,
	VITE_PLUGIN_VERSION_RANGE,
} from "../dependencies/install";
import { MINIMUM_WRANGLER_VERSION } from "../dependencies/wrangler-version";
import { fileExists } from "../file-exists";
import { createFollowUp } from "../follow-ups";
import { convertWranglerBuild, convertWranglerSettings } from "./convert";
import { findSecretFiles, readWranglerConfig } from "./read";
import type { DependencyToInstall } from "../dependencies/install";
import type {
	BundlerMigrationOptions,
	MigrationFollowUp,
	MigrationResult,
	WranglerConfigMigrationOptions,
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

function getMigrationStatus(
	followUps: MigrationFollowUp[]
): MigrationResult["status"] {
	return followUps.some(({ blocking }) => blocking)
		? "needs-intervention"
		: "complete";
}

/**
 * Adds blocking follow-ups to the TODO list in `cloudflare.config.ts`. If the file can't be
 * updated, the generated files are removed so they aren't used without their TODOs.
 *
 * @param cloudflareConfigPath The `cloudflare.config.ts` written by {@link migrateWranglerConfig}.
 * @param followUps The follow-ups to add.
 * @param createdFiles The other files this migration step created.
 */
async function addTodosToCloudflareConfig(
	cloudflareConfigPath: string,
	followUps: MigrationFollowUp[],
	createdFiles: Iterable<string>
): Promise<void> {
	if (!followUps.some(({ blocking }) => blocking)) {
		return;
	}

	try {
		const cloudflareConfig = await readFile(cloudflareConfigPath, "utf8");
		await rewriteMigrationOutput(
			cloudflareConfigPath,
			addMigrationTodos(cloudflareConfig, followUps)
		);
	} catch (error) {
		await cleanupMigrationOutputs(
			[cloudflareConfigPath, ...createdFiles],
			error
		);
	}
}

/**
 * Migrates the Worker settings of one exact Wrangler configuration file to a
 * `cloudflare.config.ts` next to it. Build settings depend on the bundler, so
 * {@link migrateBundler} migrates them afterwards.
 *
 * @param configPath Path to a Wrangler JSON, JSONC, or TOML configuration file.
 * @param options Write-safety controls, including the Git worktree check.
 *
 * @returns The generated file path and any follow-up work left for the caller.
 */
export async function migrateWranglerConfig(
	configPath: string,
	options: WranglerConfigMigrationOptions = {}
): Promise<MigrationResult> {
	const { dryRun = false, force = false } = options;
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
	const settings = convertWranglerSettings(rawConfig, secretFiles);
	if (!dryRun) {
		await writeMigrationOutputs(
			new Map([[cloudflareConfigPath, renderCloudflareConfig(settings)]])
		);
	}

	return {
		changedFiles: ["cloudflare.config.ts"],
		followUps: settings.followUps,
		requiresInstall: false,
		status: getMigrationStatus(settings.followUps),
	};
}

/**
 * Migrates the build settings of one exact Wrangler configuration file for a bundler, once
 * {@link migrateWranglerConfig} has written `cloudflare.config.ts`, and installs the packages
 * the migrated project needs. With Wrangler, the settings go to `wrangler.config.ts`; with
 * Vite, the ones it doesn't carry over become follow-ups. Blocking follow-ups are added to
 * the TODO list in `cloudflare.config.ts`.
 *
 * @param configPath Path to a Wrangler JSON, JSONC, or TOML configuration file.
 * @param options Optional bundler selection and write-safety controls.
 *
 * @returns Changed file paths and any follow-up work left for the caller.
 */
export async function migrateBundler(
	configPath: string,
	options: BundlerMigrationOptions = {}
): Promise<MigrationResult> {
	const {
		bundler = "vite",
		dryRun = false,
		installDependencies = true,
		outputDir,
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

	const build = convertWranglerBuild(
		readWranglerConfig(absoluteConfigPath),
		bundler,
		outputDir
	);
	const followUps = [...build.followUps];
	const wranglerConfig = renderWranglerConfig(build);
	const [cfDepPlan, wranglerDepPlan, vitePluginDepPlan] = await Promise.all([
		planCfDependencyInstallation(projectDirectory),
		planWranglerDependencyUpgrade(projectDirectory, wranglerConfig !== null),
		planVitePluginDependencyUpgrade(projectDirectory, bundler),
	]);
	const missingManifestPackages = formatDependencies([
		"cf@latest",
		...(bundler === "vite"
			? [`@cloudflare/vite-plugin@${VITE_PLUGIN_VERSION_RANGE}`]
			: []),
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
		followUps.push(
			createFollowUp(
				"cf-install-missing-manifest",
				`No package.json was found. Create or locate the package that owns this Worker, then install ${missingManifestPackages} as dev dependencies before using the generated configuration.`
			)
		);
	}
	if (cfDepPlan.action === "skipped-ancestor-package") {
		followUps.push(
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
		followUps.push(
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
		followUps.push(
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
		followUps.push(
			createFollowUp(
				"wrangler-upgrade-manual",
				`The generated wrangler.config.ts requires Wrangler ${MINIMUM_WRANGLER_VERSION} or newer. ${instruction}`
			)
		);
	}
	if (vitePluginDepPlan.action === "manual") {
		const instruction =
			vitePluginDepPlan.managedDependency === "incompatible"
				? "Update the project-managed plugin to a compatible version and refresh its lockfile while preserving the dependency specifier."
				: "Install dependencies and verify that the project-managed plugin resolves to a compatible version. If needed, update it and refresh the lockfile while preserving the dependency specifier.";
		followUps.push(
			createFollowUp(
				"vite-plugin-upgrade-manual",
				`The Vite migration requires @cloudflare/vite-plugin ${VITE_PLUGIN_VERSION_RANGE}. ${instruction}`
			)
		);
	}
	if (!installDependencies && wranglerDepPlan.action === "install") {
		followUps.push(
			createFollowUp(
				"wrangler-upgrade-disabled",
				"Automatic dependency installation was disabled. Install `wrangler@latest` with your package manager before using the generated configuration."
			)
		);
	}

	const outputs = new Map<string, string>();
	if (wranglerConfig) {
		outputs.set(
			path.join(projectDirectory, "wrangler.config.ts"),
			wranglerConfig
		);
	}
	const changedFiles = [
		...outputs.keys(),
		...(followUps.some(({ blocking }) => blocking)
			? [cloudflareConfigPath]
			: []),
	];
	let requiresInstall =
		cfDepPlan.action !== "already-installed" ||
		wranglerDepPlan.action !== "none" ||
		vitePluginDepPlan.action !== "none";

	await assertTargetsDoNotExist(Array.from(outputs.keys()));

	if (!dryRun) {
		await writeMigrationOutputs(outputs);
		await addTodosToCloudflareConfig(
			cloudflareConfigPath,
			followUps,
			outputs.keys()
		);
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
			const reason =
				error instanceof Error ? ` Installation failed: ${error.message}` : "";
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
			requiresInstall = true;
		}

		if (dependencyFollowUp) {
			followUps.push(dependencyFollowUp);
			if (!changedFiles.includes(cloudflareConfigPath)) {
				changedFiles.push(cloudflareConfigPath);
			}
			await addTodosToCloudflareConfig(
				cloudflareConfigPath,
				[dependencyFollowUp],
				outputs.keys()
			);
		}
	}

	return {
		changedFiles: changedFiles.map((filePath) =>
			path.relative(projectDirectory, filePath)
		),
		followUps,
		requiresInstall,
		status: getMigrationStatus(followUps),
	};
}
