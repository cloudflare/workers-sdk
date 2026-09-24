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
 */
export async function installCfDependency(
	plan: Extract<CfDependencyInstallPlan, { action: "install" }>
): Promise<void> {
	const { isWorkspaceRoot, packageDirectory } = plan;
	const packageManager = await detectPackageManager(packageDirectory);

	await installPackages(packageManager.type, ["cf@latest"], {
		cwd: packageDirectory,
		dev: true,
		isWorkspaceRoot,
	});
}
