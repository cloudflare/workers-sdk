import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parsePackageJSON, readFileSync } from "@cloudflare/workers-utils";
import {
	checkIfViteConfigUsesCloudflarePlugin,
	hasViteConfig,
} from "../frameworks/utils/vite-config";
import type { AutoConfigCommandError } from "../types";
import type { PackageJSON } from "@cloudflare/workers-utils";

type ProjectPackageJSON = PackageJSON & {
	peerDependencies?: Record<string, unknown>;
	optionalDependencies?: Record<string, unknown>;
};

/** Whether the project uses Vite+ as its Vite command runner. */
export function usesVitePlus(packageJson?: PackageJSON): boolean {
	return Boolean(
		packageJson?.dependencies?.["vite-plus"] ||
		packageJson?.devDependencies?.["vite-plus"]
	);
}

/**
 * Inspect plugin readiness for cf projects, resolving native commands when no
 * framework commands exist. Report failures as data so detection remains useful
 * before dependencies have been installed or framework setup has been applied.
 */
export function getViteProjectCommands({
	projectPath,
	packageJson,
	nodeModulesPaths,
	resolveCommands,
}: {
	projectPath: string;
	packageJson?: ProjectPackageJSON;
	nodeModulesPaths: readonly string[];
	resolveCommands: boolean;
}):
	| {
			devCommand?: string;
			buildCommand?: string;
			error?: AutoConfigCommandError;
	  }
	| undefined {
	const dependencies = {
		...packageJson?.dependencies,
		...packageJson?.devDependencies,
		...packageJson?.peerDependencies,
		...packageJson?.optionalDependencies,
	};
	if (!("@cloudflare/vite-plugin" in dependencies)) {
		return;
	}

	const plugin = readProjectPackage(
		nodeModulesPaths,
		"@cloudflare/vite-plugin"
	);
	const requirement =
		"cf requires @cloudflare/vite-plugin v2 beta for cf dev, cf build, cf deploy, and cf previews deploy.";
	const install = usesVitePlus(packageJson)
		? "npm install --save-dev @cloudflare/vite-plugin@beta vite-plus"
		: "npm install --save-dev @cloudflare/vite-plugin@beta vite";
	if (!plugin) {
		return {
			error: {
				code: "vite-plugin-not-installed",
				message: `@cloudflare/vite-plugin is declared in package.json but is not installed. ${requirement} Run ${install}.`,
			},
		};
	}
	if (!plugin.packageJson.version?.match(/^2\.\d+\.\d+(?:[-+].+)?$/)) {
		return {
			error: {
				code: "vite-plugin-incompatible",
				message: `@cloudflare/vite-plugin@${plugin.packageJson.version ?? "unknown"} is installed, but it is not compatible with cf's local runtime. ${requirement} Run ${install}.`,
			},
		};
	}
	if (!resolveCommands) {
		return {};
	}

	const packageName = usesVitePlus(packageJson) ? "vite-plus" : "vite";
	const commandName = packageName === "vite-plus" ? "vp" : "vite";
	const tool = readProjectPackage(nodeModulesPaths, packageName);
	const bin = tool?.packageJson.bin;
	const relativeBinary = typeof bin === "string" ? bin : bin?.[commandName];
	const binary =
		tool && relativeBinary
			? resolve(tool.directory, relativeBinary)
			: undefined;
	if (!binary || !existsSync(binary)) {
		return {
			error: {
				code: "vite-tool-not-installed",
				message: `@cloudflare/vite-plugin is installed, but the project's ${commandName} executable could not be found. ${requirement} Run ${install}.`,
			},
		};
	}

	if (!usesCloudflarePlugin(projectPath)) {
		return {
			error: {
				code: "vite-plugin-not-configured",
				message:
					"Could not confirm that the Vite configuration enables @cloudflare/vite-plugin. Add cloudflare() to the plugins array in your Vite configuration before running cf dev or cf build.",
			},
		};
	}

	// The same command can be parsed into argv by cf or passed to a shell by
	// runAutoConfig. cmd.exe needs Node explicitly and does not accept POSIX quotes.
	const executable =
		process.platform === "win32"
			? `"${process.execPath}" "${binary}"`
			: `'${binary.replaceAll("'", "'\\''")}'`;
	return {
		devCommand: `${executable} dev`,
		buildCommand: `${executable} build`,
	};
}

function readProjectPackage(
	nodeModulesPaths: readonly string[],
	packageName: string
):
	| {
			directory: string;
			packageJson: PackageJSON & { bin?: string | Record<string, string> };
	  }
	| undefined {
	for (const nodeModules of nodeModulesPaths) {
		const directory = join(nodeModules, packageName);
		const path = join(directory, "package.json");
		if (!existsSync(path)) {
			continue;
		}
		try {
			return {
				directory,
				packageJson: parsePackageJSON(readFileSync(path), path),
			};
		} catch {
			// A broken nearer install must not silently select another version.
			return;
		}
	}
}

function usesCloudflarePlugin(projectPath: string): boolean {
	try {
		return (
			hasViteConfig(projectPath) &&
			checkIfViteConfigUsesCloudflarePlugin(projectPath)
		);
	} catch {
		return false;
	}
}
