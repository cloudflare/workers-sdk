import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parsePackageJSON, readFileSync } from "@cloudflare/workers-utils";
import semiver from "semiver";
import { hasViteConfig } from "../frameworks/utils/vite-config";
import type { AutoConfigCommandError } from "../types";
import type { PackageJSON, PackageManager } from "@cloudflare/workers-utils";

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
 *
 * Shared workspace tools require an application-level signal: a plugin or
 * runner declaration, or a default-named Vite config. An application using a
 * custom config must declare the plugin or runner itself; arbitrary config
 * paths forwarded at execution time are not available during detection.
 */
export function getViteProjectCommands({
	projectPath,
	packageJson,
	workspaceRoot,
	packageManager,
	isWorkspaceRoot,
	nodeModulesPaths,
	resolveCommands,
}: {
	projectPath: string;
	packageJson?: ProjectPackageJSON;
	/** Only provided for configured applications inside a validated workspace. */
	workspaceRoot?: string;
	packageManager: PackageManager;
	isWorkspaceRoot?: boolean;
	nodeModulesPaths: readonly string[];
	resolveCommands: boolean;
}):
	| {
			devCommand?: string;
			buildCommand?: string;
			error?: AutoConfigCommandError;
	  }
	| undefined {
	const projectRunner = getViteRunner(packageJson);
	const projectDependencies = getDeclaredDependencies(packageJson);
	// A sibling's shared tools do not make this a Vite application. A local
	// plugin/runner declaration or Vite config opts it in without evaluating it.
	const workspacePackageJson =
		workspaceRoot &&
		("@cloudflare/vite-plugin" in projectDependencies ||
			projectRunner ||
			hasViteConfig(projectPath))
			? readPackage(join(workspaceRoot, "package.json"))
			: undefined;
	const dependencies = {
		...getDeclaredDependencies(workspacePackageJson),
		...projectDependencies,
	};
	if (!("@cloudflare/vite-plugin" in dependencies)) {
		return;
	}

	const plugin = readProjectPackage(
		nodeModulesPaths,
		"@cloudflare/vite-plugin"
	);
	const requirement =
		"cf requires @cloudflare/vite-plugin >=2.0.0-beta.v.13 <3 for cf dev, cf build, cf deploy, and cf previews deploy.";
	// An application's explicit runner takes priority over workspace defaults.
	const packageName =
		projectRunner ?? getViteRunner(workspacePackageJson) ?? "vite";
	const install = getInstallCommand(
		packageManager.type,
		packageName,
		isWorkspaceRoot
	);
	if (!plugin) {
		return {
			error: {
				code: "vite-plugin-not-installed",
				message: `@cloudflare/vite-plugin is declared in package.json but is not installed. ${requirement} Run ${install}.`,
			},
		};
	}
	const version = plugin.packageJson.version;
	if (
		!version?.match(/^2\.\d+\.\d+(?:[-+].+)?$/) ||
		semiver(version.split("+")[0], "2.0.0-beta.v.13") < 0
	) {
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

/** Peer and optional declarations alone do not select a project's command runner. */
function getViteRunner(
	packageJson?: PackageJSON
): "vite" | "vite-plus" | undefined {
	if (usesVitePlus(packageJson)) {
		return "vite-plus";
	}
	if (packageJson?.dependencies?.vite || packageJson?.devDependencies?.vite) {
		return "vite";
	}
}

function getDeclaredDependencies(packageJson?: ProjectPackageJSON) {
	return {
		...packageJson?.dependencies,
		...packageJson?.devDependencies,
		...packageJson?.peerDependencies,
		...packageJson?.optionalDependencies,
	};
}

function readPackage(path: string): ProjectPackageJSON | undefined {
	try {
		return parsePackageJSON(readFileSync(path), path);
	} catch {
		return;
	}
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

/** Suggests a repair command using the project's package manager and workspace flags. */
function getInstallCommand(
	packageManager: PackageManager["type"],
	packageName: string,
	isWorkspaceRoot = false
): string {
	const command =
		packageManager === "yarn" || packageManager === "bun"
			? "add --dev"
			: "install --save-dev";
	const workspaceFlags = {
		npm: "",
		pnpm: " --workspace-root",
		yarn: " -W",
		bun: "",
		nub: " --workspace-root",
	};
	const workspaceFlag = isWorkspaceRoot ? workspaceFlags[packageManager] : "";
	return `${packageManager} ${command} @cloudflare/vite-plugin@beta ${packageName}${workspaceFlag}`;
}
