import { existsSync } from "fs";
import { join } from "path";
import { warn } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { getLatestTypesEntrypoint } from "helpers/compatDate";
import { readFile, usesTypescript, writeFile } from "helpers/files";
import { installPackages } from "helpers/packages";
import * as jsonc from "jsonc-parser";
import type { C3Context } from "types";

/**
 * Installs the latest version of the `@cloudflare/workers-types` package
 * and updates the .tsconfig file to use the latest entrypoint version.
 */
export async function installWorkersTypes(ctx: C3Context) {
	const { npm } = ctx.packageManager;

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
				"skipped",
			)} couldn't find latest compatible version of @cloudflare/workers-types`,
		);
		return;
	}

	const typesEntrypoint = `@cloudflare/workers-types/${entrypointVersion}`;

	try {
		const config = jsonc.parse(tsconfig);
		const currentTypes = config.compilerOptions?.types ?? [];

		const explicitEntrypoint = (currentTypes as string[]).some((t) =>
			t.match(/@cloudflare\/workers-types\/\d{4}-\d{2}-\d{2}/),
		);

		// If a type declaration with an explicit entrypoint exists, leave the types as is
		// Otherwise, add the latest entrypoint
		const newTypes = explicitEntrypoint
			? [...currentTypes]
			: [
					...currentTypes.filter(
						(t: string) => t !== "@cloudflare/workers-types",
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
			},
		);
		const updated = jsonc.applyEdits(tsconfig, edits);
		writeFile(tsconfigPath, updated);
	} catch (error) {
		warn(
			"Failed to update `tsconfig.json` with latest `@cloudflare/workers-types` entrypoint.",
		);
	}

	s.stop(`${brandColor("added")} ${dim(typesEntrypoint)}`);
}
