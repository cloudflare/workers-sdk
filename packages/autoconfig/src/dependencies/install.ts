import { readFile } from "node:fs/promises";
import path from "node:path";
import { installPackages } from "@cloudflare/cli-shared-helpers/packages";
import {
	BunPackageManager,
	getInstalledPackageVersion,
	NpmPackageManager,
	NubPackageManager,
	PnpmPackageManager,
	YarnPackageManager,
} from "@cloudflare/workers-utils";
import { satisfies, subset, valid, validRange } from "semver";
import { glob } from "tinyglobby";
import { fileExists } from "../file-exists";
import { createFollowUp } from "../follow-ups";
import { CF_VITE_PLUGIN_VERSION_RANGE } from "../frameworks/utils/vite-plugin-version";
import {
	getWranglerUpgradeSpec,
	isVersionSupported,
	MINIMUM_WRANGLER_VERSION,
} from "./wrangler-version";
import type { MigrationFollowUp } from "../wrangler-config/types";
import type { PackageManager } from "@cloudflare/workers-utils";

const VITE_PLUGIN = "@cloudflare/vite-plugin";
// Managed specifiers need an installed-version check instead of range parsing.
const MANAGED_VITE_PLUGIN_SPECIFIER =
	/^(?:workspace:|file:|link:|portal:|catalog:)/;

const PACKAGE_MANAGERS = [
	NubPackageManager,
	PnpmPackageManager,
	YarnPackageManager,
	BunPackageManager,
	NpmPackageManager,
] as const satisfies readonly PackageManager[];
const NPM_LOCK_FILES = [
	"npm-shrinkwrap.json",
	...NpmPackageManager.lockFiles,
] as const;

interface PackageJson {
	dependencies?: Record<string, unknown>;
	devDependencies?: Record<string, unknown>;
	name?: unknown;
	packageManager?: unknown;
	version?: unknown;
	workspaces?: unknown;
}

type CfDependencyInstallPlan =
	| {
			action:
				| "already-installed"
				| "missing-manifest"
				| "skipped-ancestor-package";
	  }
	| {
			action: "unreadable-manifest";
			reason?: string;
	  }
	| {
			action: "install";
	  };

export type WranglerDependencyUpgradePlan =
	| { action: "none" }
	| { action: "manual"; workspaceDependency?: "incompatible" | "unverified" }
	| { action: "install"; dependency: DependencyToInstall };

export type VitePluginDependencyUpgradePlan =
	| { action: "none" }
	| { action: "manual"; managedDependency: "incompatible" | "unverified" }
	| { action: "install"; dependency: DependencyToInstall };

export interface DependencyToInstall {
	dev: boolean;
	name: string;
	version: string;
}

/** Retains changed package files when a later dependency installation fails. */
export class DependencyInstallError extends Error {
	constructor(
		readonly changedFiles: string[],
		readonly pendingDependencies: DependencyToInstall[],
		cause: unknown
	) {
		super(
			cause instanceof Error ? cause.message : "Package installation failed.",
			{
				cause,
			}
		);
	}
}

interface DependencyInstallOptions {
	dryRun: boolean;
}

interface DependencyInstallResult {
	changedFiles: string[];
	requiresInstall: boolean;
}

interface DeclaredPackageManager {
	packageManager: PackageManager;
	version?: string;
}

interface DetectedPackageManager {
	directory: string;
	packageManager: PackageManager;
	version?: string;
}

async function readPackageJson(packageJsonPath: string): Promise<PackageJson> {
	return JSON.parse(await readFile(packageJsonPath, "utf8")) as PackageJson;
}

function getPackageJsonWorkspacePatterns(
	workspaces: unknown
): string[] | undefined {
	const patterns: unknown = Array.isArray(workspaces)
		? workspaces
		: typeof workspaces === "object" &&
			  workspaces !== null &&
			  "packages" in workspaces
			? workspaces.packages
			: undefined;
	return Array.isArray(patterns) &&
		patterns.every((pattern: unknown) => typeof pattern === "string")
		? (patterns as string[])
		: undefined;
}

function getPnpmWorkspacePatterns(contents: string): string[] | undefined {
	const patterns: string[] = [];
	let inPackages = false;
	for (const line of contents.split(/\r?\n/)) {
		if (!inPackages) {
			inPackages = /^packages:\s*(?:#.*)?$/.test(line);
			continue;
		}
		if (/^\S/.test(line)) {
			break;
		}
		if (line.trim() === "" || line.trim().startsWith("#")) {
			continue;
		}
		// Accept quoted or bare globs with an optional comment; leave other YAML forms unverified.
		const match = /^\s+-\s+(?:"([^"]+)"|'([^']+)'|([^#\s]+))\s*(?:#.*)?$/.exec(
			line
		);
		if (!match) {
			return undefined;
		}
		const [, doubleQuotedGlob, singleQuotedGlob, bareGlob] = match;
		patterns.push(doubleQuotedGlob ?? singleQuotedGlob ?? bareGlob);
	}
	return patterns.length > 0 ? patterns : undefined;
}

async function findWorkspaceWranglerVersion(
	projectDirectory: string
): Promise<string | undefined> {
	let directory = projectDirectory;
	while (true) {
		try {
			const pnpmWorkspacePath = path.join(directory, "pnpm-workspace.yaml");
			const packageJsonPath = path.join(directory, "package.json");
			let patterns: string[] | undefined;
			if (await fileExists(pnpmWorkspacePath)) {
				patterns = getPnpmWorkspacePatterns(
					await readFile(pnpmWorkspacePath, "utf8")
				);
				if (!patterns) {
					return undefined;
				}
			} else if (await fileExists(packageJsonPath)) {
				const { workspaces } = await readPackageJson(packageJsonPath);
				if (workspaces !== undefined) {
					patterns = getPackageJsonWorkspacePatterns(workspaces);
					if (!patterns) {
						return undefined;
					}
				}
			}
			if (patterns) {
				const safePatterns = patterns.every((pattern) => {
					const directoryPattern = pattern.replace(/^!/, "");
					return (
						!path.isAbsolute(directoryPattern) &&
						!directoryPattern.split(/[\\/]/).includes("..")
					);
				});
				if (!safePatterns) {
					return undefined;
				}
				const packageJsonPaths = await glob(
					patterns.map((pattern) => `${pattern}/package.json`),
					{
						absolute: true,
						cwd: directory,
						dot: true,
						ignore: ["**/.git/**", "**/node_modules/**"],
						onlyFiles: true,
					}
				);
				if (
					projectDirectory !== directory &&
					!packageJsonPaths.some(
						(workspacePackageJsonPath) =>
							path.resolve(workspacePackageJsonPath) ===
							path.resolve(projectDirectory, "package.json")
					)
				) {
					return undefined;
				}
				const workspacePackages = await Promise.all(
					packageJsonPaths.map(async (workspacePackageJsonPath) => {
						try {
							return await readPackageJson(workspacePackageJsonPath);
						} catch {
							return undefined;
						}
					})
				);
				const wranglerVersions = workspacePackages.flatMap((packageJson) =>
					packageJson?.name === "wrangler" &&
					typeof packageJson.version === "string"
						? [packageJson.version]
						: []
				);
				return wranglerVersions.length === 1 ? wranglerVersions[0] : undefined;
			}
		} catch {
			return undefined;
		}

		const parentDirectory = path.dirname(directory);
		if (parentDirectory === directory) {
			return undefined;
		}
		directory = parentDirectory;
	}
}

async function getDirectlyInstalledWranglerVersion(
	projectDirectory: string
): Promise<string | undefined> {
	const packageJsonPath = path.join(
		projectDirectory,
		"node_modules",
		"wrangler",
		"package.json"
	);
	try {
		if (!(await fileExists(packageJsonPath))) {
			return undefined;
		}
		const packageJson = await readPackageJson(packageJsonPath);
		return packageJson.name === "wrangler" &&
			typeof packageJson.version === "string"
			? packageJson.version
			: undefined;
	} catch {
		return undefined;
	}
}

function hasCfDependency(packageJson: PackageJson): boolean {
	return (
		packageJson.dependencies?.cf !== undefined ||
		packageJson.devDependencies?.cf !== undefined
	);
}

/**
 * Checks whether every version a declared range can resolve to supports the
 * generated configuration. Dist tags and other non-range specifiers are not
 * compatible.
 */
function isCompatibleVitePluginRange(declaredVersion: string): boolean {
	// `subset()` rejects exact prerelease versions that the range includes.
	const exactVersion = valid(declaredVersion);
	if (exactVersion !== null) {
		return isCompatibleVitePluginVersion(exactVersion);
	}
	return (
		validRange(declaredVersion) !== null &&
		subset(declaredVersion, CF_VITE_PLUGIN_VERSION_RANGE)
	);
}

/** Checks whether an exact version supports the generated configuration. */
function isCompatibleVitePluginVersion(version: string): boolean {
	return satisfies(version, CF_VITE_PLUGIN_VERSION_RANGE, {
		includePrerelease: true,
	});
}

function needsVitePluginUpgrade(
	packageJson: PackageJson,
	projectDirectory: string
): boolean {
	const declaredVersion =
		packageJson.dependencies?.[VITE_PLUGIN] ??
		packageJson.devDependencies?.[VITE_PLUGIN];
	if (typeof declaredVersion !== "string") {
		return true;
	}

	const installedVersion = getInstalledPackageVersion(
		VITE_PLUGIN,
		projectDirectory
	);
	const compatibleInstalledVersion =
		installedVersion !== undefined &&
		isCompatibleVitePluginVersion(installedVersion);
	if (
		!isCompatibleVitePluginRange(declaredVersion) &&
		!(
			MANAGED_VITE_PLUGIN_SPECIFIER.test(declaredVersion) &&
			compatibleInstalledVersion
		)
	) {
		return true;
	}
	return installedVersion !== undefined && !compatibleInstalledVersion;
}

/** Finds the nearest package manifest at or above the migration directory. */
export async function findPackageJson(
	projectDirectory: string
): Promise<string | undefined> {
	let currentDirectory = projectDirectory;
	while (true) {
		const packageJsonPath = path.join(currentDirectory, "package.json");
		if (await fileExists(packageJsonPath)) {
			return packageJsonPath;
		}

		const parentDirectory = path.dirname(currentDirectory);
		if (parentDirectory === currentDirectory) {
			return undefined;
		}
		currentDirectory = parentDirectory;
	}
}

function getDeclaredPackageManager(
	packageJson: PackageJson
): DeclaredPackageManager | undefined {
	if (typeof packageJson.packageManager !== "string") {
		return undefined;
	}

	const versionSeparator = packageJson.packageManager.lastIndexOf("@");
	const packageManagerName =
		versionSeparator > 0
			? packageJson.packageManager.slice(0, versionSeparator)
			: packageJson.packageManager;
	const packageManager = PACKAGE_MANAGERS.find(
		({ type }) => type === packageManagerName
	);
	if (!packageManager) {
		return undefined;
	}

	return {
		packageManager,
		version:
			versionSeparator > 0
				? packageJson.packageManager.slice(versionSeparator + 1)
				: undefined,
	};
}

async function hasLockFile(
	directory: string,
	packageManager: PackageManager
): Promise<boolean> {
	const lockFilesExist = await Promise.all(
		getLockFiles(packageManager).map((lockFile) =>
			fileExists(path.join(directory, lockFile))
		)
	);
	return lockFilesExist.some(Boolean);
}

function getLockFiles(packageManager: PackageManager): readonly string[] {
	return packageManager.type === "npm"
		? NPM_LOCK_FILES
		: packageManager.lockFiles;
}

async function findLockFileDirectory(
	packageDirectory: string,
	packageManager: PackageManager
): Promise<string | undefined> {
	let currentDirectory = packageDirectory;
	while (true) {
		if (await hasLockFile(currentDirectory, packageManager)) {
			return currentDirectory;
		}

		const parentDirectory = path.dirname(currentDirectory);
		if (parentDirectory === currentDirectory) {
			return undefined;
		}
		currentDirectory = parentDirectory;
	}
}

async function detectPackageManager(
	packageDirectory: string
): Promise<DetectedPackageManager> {
	let currentDirectory = packageDirectory;
	while (true) {
		const packageJsonPath = path.join(currentDirectory, "package.json");
		if (await fileExists(packageJsonPath)) {
			const declared = getDeclaredPackageManager(
				await readPackageJson(packageJsonPath)
			);
			if (declared) {
				return {
					directory:
						(await findLockFileDirectory(
							packageDirectory,
							declared.packageManager
						)) ?? currentDirectory,
					...declared,
				};
			}
		}

		for (const packageManager of PACKAGE_MANAGERS) {
			if (await hasLockFile(currentDirectory, packageManager)) {
				return { directory: currentDirectory, packageManager };
			}
		}

		const parentDirectory = path.dirname(currentDirectory);
		if (parentDirectory === currentDirectory) {
			return {
				directory: packageDirectory,
				packageManager: NpmPackageManager,
			};
		}
		currentDirectory = parentDirectory;
	}
}

function usesTextBunLockfile(version: string | undefined): boolean {
	if (!version) {
		return true;
	}

	const match = /^(\d+)\.(\d+)/.exec(version);
	if (!match) {
		return true;
	}
	const major = Number.parseInt(match[1], 10);
	const minor = Number.parseInt(match[2], 10);
	return major > 1 || (major === 1 && minor >= 2);
}

async function getPlannedLockFiles(
	packageDirectory: string,
	packageManager: PackageManager,
	packageManagerVersion: string | undefined
): Promise<string[]> {
	const lockFilePaths = getLockFiles(packageManager).map((lockFile) =>
		path.join(packageDirectory, lockFile)
	);
	const existingLockFiles = (
		await Promise.all(
			lockFilePaths.map(async (lockFilePath) => ({
				exists: await fileExists(lockFilePath),
				lockFilePath,
			}))
		)
	)
		.filter(({ exists }) => exists)
		.map(({ lockFilePath }) => lockFilePath);

	if (existingLockFiles.length > 0) {
		return existingLockFiles;
	}
	if (packageManager.type === "bun") {
		return [
			path.join(
				packageDirectory,
				usesTextBunLockfile(packageManagerVersion) ? "bun.lock" : "bun.lockb"
			),
		];
	}
	if (packageManager.type === "npm") {
		return [path.join(packageDirectory, "package-lock.json")];
	}
	return lockFilePaths.length === 1 ? lockFilePaths : [];
}

async function readFiles(
	filePaths: string[]
): Promise<Map<string, Buffer | undefined>> {
	return new Map(
		await Promise.all(
			filePaths.map(
				async (filePath) =>
					[
						filePath,
						(await fileExists(filePath)) ? await readFile(filePath) : undefined,
					] as const
			)
		)
	);
}

function getChangedFiles(
	before: Map<string, Buffer | undefined>,
	after: Map<string, Buffer | undefined>
): string[] {
	return Array.from(before).flatMap(([filePath, beforeContents]) => {
		const afterContents = after.get(filePath);
		if (beforeContents === undefined && afterContents === undefined) {
			return [];
		}
		if (
			beforeContents === undefined ||
			afterContents === undefined ||
			!beforeContents.equals(afterContents)
		) {
			return [filePath];
		}
		return [];
	});
}

type PackageManifestPlan =
	| { action: "missing-manifest" | "skipped-ancestor-package" }
	| { action: "unreadable-manifest"; reason?: string }
	| { action: "found"; packageJson: PackageJson };

/**
 * Finds the project's own package.json, without modifying the project.
 *
 * @param projectDirectory Directory containing the project.
 *
 * @returns The package.json's contents, or why the project has no package.json of its own.
 */
async function planPackageManifest(
	projectDirectory: string
): Promise<PackageManifestPlan> {
	const packageJsonPath = await findPackageJson(projectDirectory);
	if (!packageJsonPath) {
		return { action: "missing-manifest" };
	}

	const packageDirectory = path.dirname(packageJsonPath);
	if (packageDirectory !== projectDirectory) {
		return { action: "skipped-ancestor-package" };
	}
	try {
		return {
			action: "found",
			packageJson: await readPackageJson(packageJsonPath),
		};
	} catch (error) {
		return {
			action: "unreadable-manifest",
			...(error instanceof Error ? { reason: error.message } : {}),
		};
	}
}

/**
 * Plans cf dependency installation without modifying the project.
 *
 * @param manifest The project's package.json, as {@link planPackageManifest} found it.
 *
 * @returns The dependency action required by the project.
 */
function planCfDependencyInstallation(
	manifest: PackageManifestPlan
): CfDependencyInstallPlan {
	if (manifest.action !== "found") {
		return manifest;
	}
	return hasCfDependency(manifest.packageJson)
		? { action: "already-installed" }
		: { action: "install" };
}

/**
 * Plans a Vite plugin install or upgrade when the project builds with the Cloudflare Vite plugin.
 *
 * @param projectDirectory Directory containing the project.
 * @param requiresVitePlugin Whether the project builds with the Cloudflare Vite plugin.
 * @returns The required plugin dependency action.
 */
export async function planVitePluginDependencyUpgrade(
	projectDirectory: string,
	requiresVitePlugin: boolean
): Promise<VitePluginDependencyUpgradePlan> {
	if (!requiresVitePlugin) {
		return { action: "none" };
	}

	const packageJsonPath = path.join(projectDirectory, "package.json");
	if (!(await fileExists(packageJsonPath))) {
		return { action: "none" };
	}

	let packageJson: PackageJson;
	try {
		packageJson = await readPackageJson(packageJsonPath);
	} catch {
		return { action: "none" };
	}
	if (!needsVitePluginUpgrade(packageJson, projectDirectory)) {
		return { action: "none" };
	}

	const declaredVersion =
		packageJson.dependencies?.[VITE_PLUGIN] ??
		packageJson.devDependencies?.[VITE_PLUGIN];
	if (
		typeof declaredVersion === "string" &&
		MANAGED_VITE_PLUGIN_SPECIFIER.test(declaredVersion)
	) {
		return {
			action: "manual",
			managedDependency:
				getInstalledPackageVersion(VITE_PLUGIN, projectDirectory) === undefined
					? "unverified"
					: "incompatible",
		};
	}

	return {
		action: "install",
		dependency: {
			dev: packageJson.dependencies?.[VITE_PLUGIN] === undefined,
			name: VITE_PLUGIN,
			version: CF_VITE_PLUGIN_VERSION_RANGE,
		},
	};
}

/**
 * Plans a Wrangler upgrade only when migration generates Wrangler tooling.
 * Preserves existing workspace links and dependency placement.
 *
 * @param projectDirectory Directory containing the migrated Worker.
 * @param requiresWrangler Whether migration generates wrangler.config.ts.
 * @returns The dependency action without modifying the manifest or lockfile.
 */
export async function planWranglerDependencyUpgrade(
	projectDirectory: string,
	requiresWrangler: boolean
): Promise<WranglerDependencyUpgradePlan> {
	if (!requiresWrangler) {
		return { action: "none" };
	}

	const packageJsonPath = path.join(projectDirectory, "package.json");
	if (!(await fileExists(packageJsonPath))) {
		return { action: "manual" };
	}

	let packageJson: PackageJson;
	try {
		packageJson = await readPackageJson(packageJsonPath);
	} catch {
		return { action: "manual" };
	}

	const dependency = packageJson.dependencies?.wrangler;
	const devDependency = packageJson.devDependencies?.wrangler;
	const declaredVersion = dependency ?? devDependency;
	if (
		typeof declaredVersion === "string" &&
		declaredVersion.startsWith("workspace:")
	) {
		const workspaceVersion =
			(await findWorkspaceWranglerVersion(projectDirectory)) ??
			(await getDirectlyInstalledWranglerVersion(projectDirectory));
		return workspaceVersion !== undefined &&
			isVersionSupported(workspaceVersion)
			? { action: "none" }
			: {
					action: "manual",
					workspaceDependency:
						workspaceVersion === undefined ? "unverified" : "incompatible",
				};
	}

	const upgradeSpec =
		typeof declaredVersion === "string"
			? getWranglerUpgradeSpec(projectDirectory, declaredVersion)
			: "latest";
	if (upgradeSpec === undefined) {
		return { action: "none" };
	}

	return {
		action: "install",
		dependency: {
			dev: dependency === undefined,
			name: "wrangler",
			version: upgradeSpec,
		},
	};
}

/**
 * Installs planned project dependencies with the detected package manager.
 *
 * @param packageDirectory Directory containing the project's package.json.
 * @param dependencies Packages to install in their dependency sections.
 * @param options Whether to report planned changes without installing.
 *
 * @returns Package files changed or expected to change during installation.
 */
export async function installProjectDependencies(
	packageDirectory: string,
	dependencies: DependencyToInstall[],
	options: DependencyInstallOptions
): Promise<DependencyInstallResult> {
	const packageJson = await readPackageJson(
		path.join(packageDirectory, "package.json")
	);
	const isWorkspaceRoot =
		packageJson.workspaces !== undefined ||
		(await fileExists(path.join(packageDirectory, "pnpm-workspace.yaml")));
	const {
		directory: lockFileDirectory,
		packageManager,
		version: packageManagerVersion,
	} = await detectPackageManager(packageDirectory);
	const lockFilePaths = options.dryRun
		? await getPlannedLockFiles(
				lockFileDirectory,
				packageManager,
				packageManagerVersion
			)
		: getLockFiles(packageManager).map((lockFile) =>
				path.join(lockFileDirectory, lockFile)
			);
	const packageFilePaths = [
		path.join(packageDirectory, "package.json"),
		...lockFilePaths,
	];
	if (options.dryRun) {
		return {
			changedFiles: packageFilePaths,
			requiresInstall: true,
		};
	}

	const before = await readFiles(packageFilePaths);

	for (const dev of [true, false]) {
		const packages = dependencies
			.filter((dependency) => dependency.dev === dev)
			.map(({ name, version }) => `${name}@${version}`);
		if (packages.length > 0) {
			try {
				await installPackages(packageManager.type, packages, {
					cwd: packageDirectory,
					dev,
					isWorkspaceRoot,
				});
			} catch (error) {
				throw new DependencyInstallError(
					getChangedFiles(before, await readFiles(packageFilePaths)),
					dev
						? dependencies
						: dependencies.filter((dependency) => !dependency.dev),
					error
				);
			}
		}
	}

	return {
		changedFiles: getChangedFiles(before, await readFiles(packageFilePaths)),
		requiresInstall: false,
	};
}

/** A package that a step of setup needs. */
export interface PackageDependency {
	name: string;
	/** The version or range to install. The latest version when left out. */
	version?: string;
	dev: boolean;
}

/** What installing a project's packages will do, worked out without changing anything. */
export interface DependencyPlan {
	/** The packages to install. */
	dependencies: DependencyToInstall[];
	/** TODOs for packages that won't be installed, or that need a manual update. */
	followUps: MigrationFollowUp[];
	/** Whether the project needs an install before it works. */
	requiresInstall: boolean;
	/** Whether a package needs a manual update, which installing doesn't do. */
	requiresManualUpdate: boolean;
	/** Whether installing is allowed. */
	installDependencies: boolean;
}

/** What installing a {@link DependencyPlan} did. */
export interface DependencyInstallOutcome {
	/** Package files that changed, or would change in a dry run. */
	changedFiles: string[];
	/** A TODO for the packages that couldn't be installed. */
	followUp?: MigrationFollowUp;
	/** Whether the project still needs an install before it works. */
	requiresInstall: boolean;
}

function formatDependencies(packages: string[]): string {
	const formatted = packages.map((packageName) => `\`${packageName}\``);
	if (formatted.length < 3) {
		return formatted.join(" and ");
	}
	return `${formatted.slice(0, -1).join(", ")} and ${formatted.at(-1)}`;
}

/**
 * Plans how to give a project the packages it needs, in its own package.json, without modifying it.
 * cf, the Cloudflare Vite plugin and Wrangler are checked against the versions cf needs. Any other
 * package is installed only when the project doesn't declare it.
 *
 * @param projectDirectory Directory containing the project.
 * @param packages The packages the project needs.
 * @param options Whether installing is allowed. When it isn't, the packages are listed as TODOs.
 *
 * @returns The packages to install, and TODOs for the ones that won't be.
 */
export async function planProjectDependencies(
	projectDirectory: string,
	packages: PackageDependency[],
	{ installDependencies }: { installDependencies: boolean }
): Promise<DependencyPlan> {
	if (packages.length === 0) {
		return {
			dependencies: [],
			followUps: [],
			requiresInstall: false,
			requiresManualUpdate: false,
			installDependencies,
		};
	}
	const directory = path.resolve(projectDirectory);
	const needsCf = packages.some(({ name }) => name === "cf");
	const needsVitePlugin = packages.some(({ name }) => name === VITE_PLUGIN);
	const needsWrangler = packages.some(({ name }) => name === "wrangler");
	const otherPackages = packages.filter(
		({ name }) => name !== "cf" && name !== VITE_PLUGIN && name !== "wrangler"
	);
	const [manifest, vitePlugin, wrangler] = await Promise.all([
		planPackageManifest(directory),
		planVitePluginDependencyUpgrade(directory, needsVitePlugin),
		planWranglerDependencyUpgrade(directory, needsWrangler),
	]);
	const cf = needsCf ? planCfDependencyInstallation(manifest) : undefined;
	const otherInstalls: DependencyToInstall[] =
		manifest.action === "found"
			? otherPackages
					.filter(
						({ name }) =>
							manifest.packageJson.dependencies?.[name] === undefined &&
							manifest.packageJson.devDependencies?.[name] === undefined
					)
					.map(({ name, version = "latest", dev }) => ({ dev, name, version }))
			: [];
	const dependencies: DependencyToInstall[] = [
		...(cf?.action === "install"
			? [{ dev: true, name: "cf", version: "latest" }]
			: []),
		...(vitePlugin.action === "install" ? [vitePlugin.dependency] : []),
		...otherInstalls,
		...(wrangler.action === "install" ? [wrangler.dependency] : []),
	];

	const missingManifestPackages = formatDependencies([
		...(needsCf ? ["cf@latest"] : []),
		...(needsVitePlugin
			? [`${VITE_PLUGIN}@${CF_VITE_PLUGIN_VERSION_RANGE}`]
			: []),
		...otherPackages.map(({ name, version }) =>
			version === undefined ? name : `${name}@${version}`
		),
	]);
	const dependencyNames = formatDependencies(
		dependencies
			.filter(({ name }) => name !== "wrangler")
			.map(({ name, version }) => `${name}@${version}`)
	);
	const unreadableManifest = manifest.action === "unreadable-manifest";
	const followUps: MigrationFollowUp[] = [];
	if (manifest.action === "missing-manifest") {
		followUps.push(
			createFollowUp(
				"cf-install-missing-manifest",
				`No package.json was found. Create or locate the package that owns this Worker, then install ${missingManifestPackages} as dev dependencies before using the generated configuration.`
			)
		);
	}
	if (manifest.action === "skipped-ancestor-package") {
		followUps.push(
			createFollowUp(
				"cf-install-skipped",
				`An ancestor package.json was found, but it was not modified because it may belong to another project. Install ${missingManifestPackages} as dev dependencies in the package that owns this Worker.`
			)
		);
	}
	if (installDependencies && manifest.action === "unreadable-manifest") {
		const reason = manifest.reason
			? ` Package manifest error: ${manifest.reason}`
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
		(cf?.action === "install" ||
			unreadableManifest ||
			vitePlugin.action === "install" ||
			otherInstalls.length > 0)
	) {
		followUps.push(
			createFollowUp(
				cf?.action === "install" || unreadableManifest
					? "cf-install-disabled"
					: vitePlugin.action === "install"
						? "vite-plugin-install-disabled"
						: "dependency-install-disabled",
				`Automatic dependency installation was disabled. Install ${unreadableManifest ? missingManifestPackages : dependencyNames} before using the generated configuration.`
			)
		);
	}
	if (wrangler.action === "manual") {
		const instruction =
			wrangler.workspaceDependency === "incompatible"
				? "Update the workspace Wrangler package and its lockfile while preserving the workspace dependency."
				: wrangler.workspaceDependency === "unverified"
					? "Verify the workspace Wrangler package version and install workspace dependencies. Update the package and lockfile if needed while preserving the workspace dependency."
					: "Add `wrangler@latest` to the package that owns this Worker and update its lockfile.";
		followUps.push(
			createFollowUp(
				"wrangler-upgrade-manual",
				`The generated wrangler.config.ts requires Wrangler ${MINIMUM_WRANGLER_VERSION} or newer. ${instruction}`
			)
		);
	}
	if (vitePlugin.action === "manual") {
		const instruction =
			vitePlugin.managedDependency === "incompatible"
				? "Update the project-managed plugin to a compatible version and refresh its lockfile while preserving the dependency specifier."
				: "Install dependencies and verify that the project-managed plugin resolves to a compatible version. If needed, update it and refresh the lockfile while preserving the dependency specifier.";
		followUps.push(
			createFollowUp(
				"vite-plugin-upgrade-manual",
				`The Vite migration requires @cloudflare/vite-plugin ${CF_VITE_PLUGIN_VERSION_RANGE}. ${instruction}`
			)
		);
	}
	if (!installDependencies && wrangler.action === "install") {
		followUps.push(
			createFollowUp(
				"wrangler-upgrade-disabled",
				"Automatic dependency installation was disabled. Install `wrangler@latest` with your package manager before using the generated configuration."
			)
		);
	}

	return {
		dependencies,
		followUps,
		requiresInstall:
			dependencies.length > 0 ||
			manifest.action !== "found" ||
			wrangler.action === "manual" ||
			vitePlugin.action === "manual",
		requiresManualUpdate:
			wrangler.action === "manual" || vitePlugin.action === "manual",
		installDependencies,
	};
}

/**
 * Installs the packages a {@link DependencyPlan} lists, in one run with the project's package manager.
 * A failed install becomes a TODO rather than an error, so the rest of setup can carry on.
 *
 * @param projectDirectory Directory containing the project.
 * @param plan The plan from {@link planProjectDependencies}.
 * @param options Whether to only report the package files that would change.
 *
 * @returns The package files that changed, and a TODO if any package couldn't be installed.
 */
export async function installPlannedDependencies(
	projectDirectory: string,
	plan: DependencyPlan,
	{ dryRun }: { dryRun: boolean }
): Promise<DependencyInstallOutcome> {
	if (!plan.installDependencies || plan.dependencies.length === 0) {
		return { changedFiles: [], requiresInstall: plan.requiresInstall };
	}
	try {
		const result = await installProjectDependencies(
			path.resolve(projectDirectory),
			plan.dependencies,
			{ dryRun }
		);
		return {
			changedFiles: result.changedFiles,
			requiresInstall: result.requiresInstall || plan.requiresManualUpdate,
		};
	} catch (error) {
		if (dryRun) {
			throw error;
		}
		const pendingDependencies =
			error instanceof DependencyInstallError
				? error.pendingDependencies
				: plan.dependencies;
		const reason =
			error instanceof Error ? ` Installation failed: ${error.message}` : "";
		const packageNames = formatDependencies(
			pendingDependencies.map(({ name }) => name)
		);
		const packageSpecifiers = formatDependencies(
			pendingDependencies.map(({ name, version }) => `${name}@${version}`)
		);
		return {
			changedFiles:
				error instanceof DependencyInstallError ? error.changedFiles : [],
			followUp: createFollowUp(
				pendingDependencies.some(({ name }) => name === "cf")
					? "cf-install-failed"
					: pendingDependencies.some(({ name }) => name === "wrangler")
						? "wrangler-upgrade-failed"
						: pendingDependencies.some(({ name }) => name === VITE_PLUGIN)
							? "vite-plugin-install-failed"
							: "dependency-install-failed",
				`The generated configuration was written, but ${packageNames} could not be installed automatically. Install ${packageSpecifiers} with your package manager before using it.${reason}`
			),
			requiresInstall: true,
		};
	}
}
