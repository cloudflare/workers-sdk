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

interface PackageJson {
	dependencies?: Record<string, unknown>;
	devDependencies?: Record<string, unknown>;
	packageManager?: unknown;
	workspaces?: unknown;
}

type CfDependencyInstallResult = "complete" | "skipped-ancestor-package";

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
): PackageManager | undefined {
	if (typeof packageJson.packageManager !== "string") {
		return undefined;
	}

	const packageManagerName = packageJson.packageManager.split("@", 1)[0];
	return PACKAGE_MANAGERS.find(({ type }) => type === packageManagerName);
}

async function hasLockFile(
	directory: string,
	packageManager: PackageManager
): Promise<boolean> {
	const lockFilesExist = await Promise.all(
		packageManager.lockFiles.map((lockFile) =>
			fileExists(path.join(directory, lockFile))
		)
	);
	return lockFilesExist.some(Boolean);
}

async function detectPackageManager(
	packageDirectory: string
): Promise<PackageManager> {
	let currentDirectory = packageDirectory;
	while (true) {
		const packageJsonPath = path.join(currentDirectory, "package.json");
		if (await fileExists(packageJsonPath)) {
			const declaredPackageManager = getDeclaredPackageManager(
				await readPackageJson(packageJsonPath)
			);
			if (declaredPackageManager) {
				return declaredPackageManager;
			}
		}

		for (const packageManager of PACKAGE_MANAGERS) {
			if (await hasLockFile(currentDirectory, packageManager)) {
				return packageManager;
			}
		}

		const parentDirectory = path.dirname(currentDirectory);
		if (parentDirectory === currentDirectory) {
			return NpmPackageManager;
		}
		currentDirectory = parentDirectory;
	}
}

/**
 * Installs cf when the migrated project has a package manifest that lacks it.
 *
 * @param projectDirectory Directory containing the Wrangler configuration.
 *
 * @returns Whether installation completed or an ancestor package was skipped.
 */
export async function installCfDependency(
	projectDirectory: string
): Promise<CfDependencyInstallResult> {
	const packageJsonPath = await findPackageJson(projectDirectory);
	if (!packageJsonPath) {
		return "complete";
	}

	const packageJson = await readPackageJson(packageJsonPath);
	if (
		packageJson.dependencies?.cf !== undefined ||
		packageJson.devDependencies?.cf !== undefined
	) {
		return "complete";
	}

	const packageDirectory = path.dirname(packageJsonPath);
	if (packageDirectory !== projectDirectory) {
		return "skipped-ancestor-package";
	}

	const packageManager = await detectPackageManager(packageDirectory);
	const isWorkspaceRoot =
		packageJson.workspaces !== undefined ||
		(await fileExists(path.join(packageDirectory, "pnpm-workspace.yaml")));

	await installPackages(packageManager.type, ["cf@latest"], {
		cwd: packageDirectory,
		dev: true,
		isWorkspaceRoot,
	});

	return "complete";
}
