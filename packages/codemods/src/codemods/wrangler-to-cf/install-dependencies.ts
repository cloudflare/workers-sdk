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
import { fileExists } from "../../files";
import {
	getWranglerUpgradeSpec,
	isVersionSupported,
	MINIMUM_WRANGLER_VERSION,
} from "./wrangler-version";
import type { PackageManager } from "@cloudflare/workers-utils";

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
	packageManager?: unknown;
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
	| { action: "manual"; workspaceDependency?: boolean }
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

function hasCfDependency(packageJson: PackageJson): boolean {
	return (
		packageJson.dependencies?.cf !== undefined ||
		packageJson.devDependencies?.cf !== undefined
	);
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

/**
 * Plans cf dependency installation without modifying the project.
 *
 * @param projectDirectory Directory containing the Wrangler configuration.
 *
 * @returns The dependency action required by the migrated project.
 */
export async function planCfDependencyInstallation(
	projectDirectory: string
): Promise<CfDependencyInstallPlan> {
	const packageJsonPath = await findPackageJson(projectDirectory);
	if (!packageJsonPath) {
		return { action: "missing-manifest" };
	}

	const packageDirectory = path.dirname(packageJsonPath);
	if (packageDirectory !== projectDirectory) {
		return { action: "skipped-ancestor-package" };
	}
	let packageJson: PackageJson;
	try {
		packageJson = await readPackageJson(packageJsonPath);
	} catch (error) {
		return {
			action: "unreadable-manifest",
			...(error instanceof Error ? { reason: error.message } : {}),
		};
	}
	if (hasCfDependency(packageJson)) {
		return { action: "already-installed" };
	}
	return { action: "install" };
}

/**
 * Plans a Wrangler upgrade while retaining its current dependency section.
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
		const installedVersion = getInstalledPackageVersion(
			"wrangler",
			projectDirectory
		);
		return installedVersion !== undefined &&
			isVersionSupported(installedVersion)
			? { action: "none" }
			: { action: "manual", workspaceDependency: true };
	}

	const upgradeSpec =
		typeof declaredVersion === "string"
			? getWranglerUpgradeSpec(projectDirectory, declaredVersion)
			: `^${MINIMUM_WRANGLER_VERSION}`;
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
