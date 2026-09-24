import { readFile } from "node:fs/promises";
import path from "node:path";
import { installPackages } from "@cloudflare/cli-shared-helpers/packages";
import {
	BunPackageManager,
	NpmPackageManager,
	NubPackageManager,
	PnpmPackageManager,
	YarnPackageManager,
} from "@cloudflare/workers-utils";
import { fileExists } from "../../files";
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
			action: "install";
			isWorkspaceRoot: boolean;
			packageDirectory: string;
	  };

interface CfDependencyInstallOptions {
	dryRun: boolean;
}

interface CfDependencyInstallResult {
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
					directory: currentDirectory,
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

	const packageJson = await readPackageJson(packageJsonPath);
	if (
		packageJson.dependencies?.cf !== undefined ||
		packageJson.devDependencies?.cf !== undefined
	) {
		return { action: "already-installed" };
	}

	const packageDirectory = path.dirname(packageJsonPath);
	if (packageDirectory !== projectDirectory) {
		return { action: "skipped-ancestor-package" };
	}
	const isWorkspaceRoot =
		packageJson.workspaces !== undefined ||
		(await fileExists(path.join(packageDirectory, "pnpm-workspace.yaml")));

	return {
		action: "install",
		isWorkspaceRoot,
		packageDirectory,
	};
}

/**
 * Installs cf using a dependency installation plan.
 *
 * @param plan Planned package manager invocation for the migrated project.
 * @param options Whether to report planned changes without installing.
 *
 * @returns Package files changed or expected to change during installation.
 */
export async function installCfDependency(
	plan: Extract<CfDependencyInstallPlan, { action: "install" }>,
	options: CfDependencyInstallOptions
): Promise<CfDependencyInstallResult> {
	const { isWorkspaceRoot, packageDirectory } = plan;
	const {
		directory: lockFileDirectory,
		packageManager,
		version,
	} = await detectPackageManager(packageDirectory);
	const lockFilePaths = options.dryRun
		? await getPlannedLockFiles(lockFileDirectory, packageManager, version)
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

	await installPackages(packageManager.type, ["cf@latest"], {
		cwd: packageDirectory,
		dev: true,
		isWorkspaceRoot,
	});

	return {
		changedFiles: getChangedFiles(before, await readFiles(packageFilePaths)),
		requiresInstall: false,
	};
}
