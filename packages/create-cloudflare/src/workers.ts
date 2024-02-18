import { existsSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { warn } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { getWorkerdCompatibilityDate, installPackages } from "helpers/command";
import { readFile, usesTypescript, writeFile } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import * as jsonc from "jsonc-parser";
import MagicString from "magic-string";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

export const wranglerTomlExists = (ctx: C3Context) => {
	const wranglerTomlPath = resolve(ctx.project.path, "wrangler.toml");
	return existsSync(wranglerTomlPath);
};

export const readWranglerToml = (ctx: C3Context) => {
	const wranglerTomlPath = resolve(ctx.project.path, "wrangler.toml");
	return readFile(wranglerTomlPath);
};

export const writeWranglerToml = (ctx: C3Context, contents: string) => {
	const wranglerTomlPath = resolve(ctx.project.path, "wrangler.toml");
	return writeFile(wranglerTomlPath, contents);
};

/**
 * Update the `wrangler.toml` file for this project by setting the name
 * to the selected project name and adding the latest compatibility date.
 */
export const updateWranglerToml = async (ctx: C3Context) => {
	if (!wranglerTomlExists(ctx)) {
		return;
	}

	const wranglerToml = readWranglerToml(ctx);
	const newToml = new MagicString(wranglerToml);

	const compatDateRe = /^compatibility_date\s*=.*/m;

	if (wranglerToml.match(compatDateRe)) {
		// If the compat date is already a valid one, leave it since it may be there
		// for a specific compat reason
		const validCompatDateRe = /^compatibility_date\s*=\s*"\d{4}-\d{2}-\d{2}"/m;
		if (!wranglerToml.match(validCompatDateRe)) {
			newToml.replace(
				compatDateRe,
				`compatibility_date = "${await getWorkerdCompatibilityDate()}"`
			);
		}
	} else {
		newToml.prepend(
			`compatibility_date = "${await getWorkerdCompatibilityDate()}"`
		);
	}

	const nameRe = /^name\s*=.*/m;
	if (wranglerToml.match(nameRe)) {
		newToml.replace(nameRe, `name = "${ctx.project.name}"`);
	} else {
		newToml.prepend(`name = "${ctx.project.name}"`);
	}

	writeWranglerToml(ctx, newToml.toString());
};

/**
 * Installs the latest version of the `@cloudflare/workers-types` package
 * and updates the .tsconfig file to use the latest entrypoint version.
 */
export async function installWorkersTypes(ctx: C3Context) {
	if (!usesTypescript(ctx)) {
		return;
	}

	await installPackages(["@cloudflare/workers-types"], {
		dev: true,
		startText: "Installing @cloudflare/workers-types",
		doneText: `${brandColor("installed")} ${dim(`via ${npm}`)}`,
	});
	await addWorkersTypesToTsConfig(ctx);
}

export async function addWorkersTypesToTsConfig(ctx: C3Context) {
	const tsconfigPath = join(ctx.project.path, "tsconfig.json");
	if (!existsSync(tsconfigPath)) {
		return;
	}

	const s = spinner();
	s.start("Adding latest types to `tsconfig.json`");

	const tsconfig = readFile(tsconfigPath);
	const entrypointVersion = getLatestTypesEntrypoint(ctx);
	if (entrypointVersion === null) {
		s.stop(
			`${brandColor(
				"skipped"
			)} couldn't find latest compatible version of @cloudflare/workers-types`
		);
		return;
	}

	const typesEntrypoint = `@cloudflare/workers-types/${entrypointVersion}`;

	try {
		const config = jsonc.parse(tsconfig);
		const currentTypes = config.compilerOptions?.types ?? [];

		const explicitEntrypoint = (currentTypes as string[]).some((t) =>
			t.match(/@cloudflare\/workers-types\/\d{4}-\d{2}-\d{2}/)
		);

		// If a type declaration with an explicit entrypoint exists, leave the types as is
		// Otherwise, add the latest entrypoint
		const newTypes = explicitEntrypoint
			? [...currentTypes]
			: [
					...currentTypes.filter(
						(t: string) => t !== "@cloudflare/workers-types"
					),
					typesEntrypoint,
			  ];

		// If we detect any tabs, use tabs, otherwise use spaces.
		// We need to pass an explicit value here in order to preserve formatting properly.
		const useSpaces = !tsconfig.match(/\t/g);

		// Calculate required edits and apply them to file
		const edits = jsonc.modify(
			tsconfig,
			["compilerOptions", "types"],
			newTypes,
			{
				formattingOptions: { insertSpaces: useSpaces },
			}
		);
		const updated = jsonc.applyEdits(tsconfig, edits);
		writeFile(tsconfigPath, updated);
	} catch (error) {
		warn(
			"Failed to update `tsconfig.json` with latest `@cloudflare/workers-types` entrypoint."
		);
	}

	s.stop(`${brandColor("added")} ${dim(typesEntrypoint)}`);
}

// The `@cloudflare/workers-types` package is versioned by compatibility dates, so we
// must look up the latest entrypiont from the installed dependency on disk.
// See also https://github.com/cloudflare/workerd/tree/main/npm/workers-types#compatibility-dates
export function getLatestTypesEntrypoint(ctx: C3Context) {
	const workersTypesPath = resolve(
		ctx.project.path,
		"node_modules",
		"@cloudflare",
		"workers-types"
	);

	try {
		const entrypoints = readdirSync(workersTypesPath);

		const sorted = entrypoints
			.filter((filename) => filename.match(/(\d{4})-(\d{2})-(\d{2})/))
			.sort()
			.reverse();

		if (sorted.length === 0) {
			return null;
		}

		return sorted[0];
	} catch (error) {
		return null;
	}
}
