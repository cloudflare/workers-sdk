import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parsePackageJSON, readFileSync } from "@cloudflare/workers-utils";
import { AutoConfigFrameworkConfigurationError } from "../errors";
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
 * Resolve native commands for a cf Vite-plugin project without framework commands.
 * Resolve package binaries locally so neither cf's dependencies nor an unrelated
 * parent installation can supply a missing project tool.
 */
export function getViteFallbackCommands(
	projectPath: string,
	packageJson?: ProjectPackageJSON
): { devCommand: string; buildCommand: string } | undefined {
	const dependencies = {
		...packageJson?.dependencies,
		...packageJson?.devDependencies,
		...packageJson?.peerDependencies,
		...packageJson?.optionalDependencies,
	};
	if (!("@cloudflare/vite-plugin" in dependencies)) {
		return;
	}

	const plugin = readLocalPackage(projectPath, "@cloudflare/vite-plugin");
	const requirement =
		"cf requires @cloudflare/vite-plugin v2 beta for cf dev, cf build, cf deploy, and cf previews deploy.";
	const install = usesVitePlus(packageJson)
		? "npm install --save-dev @cloudflare/vite-plugin@beta vite-plus"
		: "npm install --save-dev @cloudflare/vite-plugin@beta vite";
	if (!plugin) {
		throw commandError(
			`@cloudflare/vite-plugin is declared in package.json but is not installed. ${requirement} Run ${install}.`
		);
	}
	if (!plugin.version?.match(/^2\.\d+\.\d+(?:[-+].+)?$/)) {
		throw commandError(
			`@cloudflare/vite-plugin@${plugin.version ?? "unknown"} is installed, but it is not compatible with cf's local runtime. ${requirement} Run ${install}.`
		);
	}

	const packageName = usesVitePlus(packageJson) ? "vite-plus" : "vite";
	const commandName = packageName === "vite-plus" ? "vp" : "vite";
	const tool = readLocalPackage(projectPath, packageName);
	const bin = tool?.bin;
	const relativeBinary = typeof bin === "string" ? bin : bin?.[commandName];
	const binary = relativeBinary
		? resolve(projectPath, "node_modules", packageName, relativeBinary)
		: undefined;
	if (!binary || !existsSync(binary)) {
		throw commandError(
			`@cloudflare/vite-plugin is installed, but the project's ${commandName} executable could not be found. ${requirement} Run ${install}.`
		);
	}

	// Commands are parsed into argv by cf, including quoted paths with spaces.
	const quotedBinary = `'${binary.replaceAll("'", "'\\''")}'`;
	return {
		devCommand: `${quotedBinary} dev`,
		buildCommand: `${quotedBinary} build`,
	};
}

function readLocalPackage(
	projectPath: string,
	packageName: string
): (PackageJSON & { bin?: string | Record<string, string> }) | undefined {
	const path = join(projectPath, "node_modules", packageName, "package.json");
	try {
		return parsePackageJSON(readFileSync(path), path);
	} catch {
		return;
	}
}

function commandError(message: string): AutoConfigFrameworkConfigurationError {
	return new AutoConfigFrameworkConfigurationError(message, {
		telemetryMessage: "autoconfig vite command unavailable",
	});
}
