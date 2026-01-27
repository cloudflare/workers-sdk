import { existsSync } from "node:fs";
import { join } from "node:path";
import { warn } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { runCommand } from "helpers/command";
import { getLatestTypesEntrypoint } from "helpers/compatDate";
import { readFile, readJSON, usesTypescript, writeFile } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import * as jsonc from "jsonc-parser";
import TOML from "smol-toml";
import {
	readWranglerJsonOrJsonc,
	readWranglerToml,
	wranglerJsonOrJsoncExists,
	wranglerTomlExists,
} from "./wrangler/config";
import type { C3Context, PackageJson } from "types";

export async function addTypes(ctx: C3Context) {
	if (!usesTypescript(ctx) || ctx.template.workersTypes === "none") {
		return;
	}
	const { npm } = detectPackageManager();

	if (ctx.template.workersTypes === "installed") {
		await installWorkersTypes(npm);
	} else if (ctx.template.workersTypes === "generated") {
		await generateWorkersTypes(ctx, npm);
	}
	const usesNodeCompat = await maybeInstallNodeTypes(ctx, npm);
	await updateTsConfig(ctx, { usesNodeCompat });
}

/**
 * Generate types using the `cf-typegen` script and update tsconfig
 */
async function generateWorkersTypes(ctx: C3Context, npm: string) {
	const packageJsonPath = join(ctx.project.path, "package.json");
	if (!existsSync(packageJsonPath)) {
		return;
	}
	const packageManifest = readJSON(packageJsonPath) as PackageJson;
	if (!packageManifest.scripts?.["cf-typegen"]) {
		return;
	}

	const typesCmd = [npm, "run", "cf-typegen"];

	await runCommand(typesCmd, {
		cwd: ctx.project.path,
		silent: true,
		startText: "Generating types for your application",
		doneText: `${brandColor("generated")} ${dim(`to \`${ctx.template.typesPath}\` via \`${typesCmd.join(" ")}\``)}`,
	});

	if (packageManifest["devDependencies"]?.["@cloudflare/workers-types"]) {
		delete packageManifest["devDependencies"]?.["@cloudflare/workers-types"];
		writeFile(packageJsonPath, JSON.stringify(packageManifest, null, 2));
	}
}

const maybeInstallNodeTypes = async (ctx: C3Context, npm: string) => {
	let parsedConfig: Record<string, unknown> = {};
	if (wranglerJsonOrJsoncExists(ctx)) {
		parsedConfig = readWranglerJsonOrJsonc(ctx);
	} else if (wranglerTomlExists(ctx)) {
		const wranglerTomlStr = readWranglerToml(ctx);
		parsedConfig = TOML.parse(wranglerTomlStr);
	}

	const compatibilityFlags = Array.isArray(parsedConfig["compatibility_flags"])
		? parsedConfig["compatibility_flags"]
		: [];

	if (
		compatibilityFlags.includes("nodejs_compat") ||
		compatibilityFlags.includes("nodejs_compat_v2")
	) {
		await installPackages(["@types/node"], {
			dev: true,
			startText: "Installing @types/node",
			doneText: `${brandColor("installed")} ${dim(`via ${npm}`)}`,
		});
		return true;
	}
	return false;
};

/**
 * update `types` in tsconfig:
 * - set workers-types to latest entrypoint if installed
 * - remove workers-types if runtime types have been generated
 * - add generated types file if types were generated
 * - add node if node compat
 */
export async function updateTsConfig(
	ctx: C3Context,
	{ usesNodeCompat }: { usesNodeCompat: boolean },
) {
	const tsconfigPath = join(ctx.project.path, "tsconfig.json");
	if (!existsSync(tsconfigPath)) {
		return;
	}
	const tsconfig = readFile(tsconfigPath);
	try {
		const config = jsonc.parse(tsconfig);

		// Skip if tsconfig uses project references
		// Types should be defined in child tsconfigs (e.g., tsconfig.worker.json)
		if (hasProjectReferences(config)) {
			return;
		}

		const currentTypes: string[] = config.compilerOptions?.types ?? [];
		let newTypes = new Set(currentTypes);
		if (ctx.template.workersTypes === "installed") {
			const entrypointVersion = getLatestTypesEntrypoint(ctx);
			if (entrypointVersion === null) {
				return;
			}
			const typesEntrypoint = `@cloudflare/workers-types/${entrypointVersion}`;
			const explicitEntrypoint = currentTypes.some((t) =>
				t.match(/@cloudflare\/workers-types\/\d{4}-\d{2}-\d{2}/),
			);
			// If a type declaration with an explicit entrypoint exists, leave the types as is.
			// Otherwise, add the latest entrypoint
			if (!explicitEntrypoint) {
				newTypes.delete("@cloudflare/workers-types");
				newTypes.add(typesEntrypoint);
			}
		} else if (ctx.template.workersTypes === "generated") {
			newTypes.add(ctx.template.typesPath ?? "./worker-configuration.d.ts");

			// if generated types include runtime types, remove @cloudflare/workers-types
			const typegen = readFile(
				ctx.template.typesPath ?? "./worker-configuration.d.ts",
			).split("\n");
			if (
				typegen.some((line) =>
					line.includes("// Runtime types generated with workerd"),
				)
			) {
				newTypes = new Set(
					[...newTypes].filter(
						(type) => !type.startsWith("@cloudflare/workers-types"),
					),
				);
			}
		}
		// add node types if nodejs_compat is enabled
		if (usesNodeCompat) {
			newTypes.add("node");
		}

		// If we detect any tabs, use tabs, otherwise use spaces.
		// We need to pass an explicit value here in order to preserve formatting properly.
		const useSpaces = !tsconfig.match(/\t/g);

		// Calculate required edits and apply them to file
		const edits = jsonc.modify(
			tsconfig,
			["compilerOptions", "types"],
			[...newTypes].sort(),
			{
				formattingOptions: { insertSpaces: useSpaces },
			},
		);
		const updated = jsonc.applyEdits(tsconfig, edits);
		writeFile(tsconfigPath, updated);
	} catch {
		warn("Failed to update `tsconfig.json`.");
	}
}

function hasProjectReferences(config: unknown): boolean {
	if (typeof config !== "object" || config === null) {
		return false;
	}

	const tsconfig = config as Record<string, unknown>;

	return Array.isArray(tsconfig.references) && tsconfig.references.length > 0;
}

/**
 * TODO: delete if/when qwik move to wrangler v4
 * Installs the latest version of the `@cloudflare/workers-types` package
 * and updates the .tsconfig file to use the latest entrypoint version.
 */
async function installWorkersTypes(npm: string) {
	await installPackages(["@cloudflare/workers-types"], {
		dev: true,
		startText: "Installing @cloudflare/workers-types",
		doneText: `${brandColor("installed")} ${dim(`via ${npm}`)}`,
	});
}
