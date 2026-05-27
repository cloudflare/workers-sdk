import { join } from "node:path";
import { parsePackageJSON, readFileSync } from "@cloudflare/workers-utils";
import { Framework } from "./framework-class";
import { getInstalledPackageVersion } from "./utils/packages";
import {
	checkIfViteConfigUsesCloudflarePlugin,
	createViteConfigWithCloudflarePlugin,
	hasViteConfig,
	transformViteConfig,
} from "./utils/vite-config";
import { installCloudflareVitePlugin } from "./utils/vite-plugin";
import type { AutoConfigFrameworkPackageInfo } from ".";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";
import type { PackageJSON } from "@cloudflare/workers-utils";

export class Vite extends Framework {
	isConfigured(projectPath: string): boolean {
		return checkIfViteConfigUsesCloudflarePlugin(projectPath);
	}

	validateFrameworkVersion(
		projectPath: string,
		frameworkPackageInfo: AutoConfigFrameworkPackageInfo
	): void {
		const installedVersion = getInstalledPackageVersion(
			frameworkPackageInfo.name,
			projectPath
		);

		if (installedVersion) {
			this.validateAndSetFrameworkVersion(
				installedVersion,
				frameworkPackageInfo
			);
			return;
		}

		const declaredVersion = getDeclaredViteVersion(projectPath);
		if (declaredVersion) {
			this.validateAndSetFrameworkVersion(
				declaredVersion,
				frameworkPackageInfo
			);
			return;
		}

		super.validateFrameworkVersion(projectPath, frameworkPackageInfo);
	}

	async configure({
		dryRun,
		projectPath,
		packageManager,
		isWorkspaceRoot,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			await installCloudflareVitePlugin({
				packageManager: packageManager.type,
				isWorkspaceRoot,
				projectPath,
			});

			if (hasViteConfig(projectPath)) {
				transformViteConfig(projectPath);
			} else {
				createViteConfigWithCloudflarePlugin(projectPath);
			}
		}

		return {
			wranglerConfig: {
				assets: {
					not_found_handling: "single-page-application",
				},
			},
		};
	}
}

type PackageJsonWithAdditionalDependencies = PackageJSON & {
	optionalDependencies?: Record<string, unknown>;
	peerDependencies?: Record<string, unknown>;
};

function getDeclaredViteVersion(projectPath: string): string | undefined {
	const packageJsonPath = join(projectPath, "package.json");

	let packageJson: PackageJsonWithAdditionalDependencies;
	try {
		packageJson = parsePackageJSON(
			readFileSync(packageJsonPath),
			packageJsonPath
		) as PackageJsonWithAdditionalDependencies;
	} catch {
		return undefined;
	}

	return getVersionFromSpecifier(
		packageJson.dependencies?.vite ??
			packageJson.devDependencies?.vite ??
			packageJson.optionalDependencies?.vite ??
			packageJson.peerDependencies?.vite
	);
}

function getVersionFromSpecifier(
	versionSpecifier: unknown
): string | undefined {
	if (typeof versionSpecifier !== "string") {
		return undefined;
	}

	const versionMatch = versionSpecifier.match(
		/(\d+)(?:\.(\d+))?(?:\.(\d+))?(-[0-9A-Za-z.-]+)?/
	);

	if (!versionMatch) {
		return undefined;
	}

	const [, major, minor = "0", patch = "0", prerelease = ""] = versionMatch;
	return `${major}.${minor}.${patch}${prerelease}`;
}
