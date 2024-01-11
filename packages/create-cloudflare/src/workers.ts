import { existsSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { getWorkerdCompatibilityDate, installPackages } from "helpers/command";
import { appendFile, readFile, usesTypescript, writeFile } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

export const runWorkersGenerator = async (ctx: C3Context) => {
	await installWorkersTypes(ctx);
};

export async function createWranglerToml(ctx: C3Context) {
	if (ctx.template.platform !== "workers") {
		return;
	}

	// The formatting below is ugly, but necessary to avoid formatting the output file
	const wranglerTomlPath = resolve(ctx.project.path, "wrangler.toml");
	const wranglerToml = `name = "${ctx.project.name}"
main = "src/index.ts"
compatibility_date = "${await getWorkerdCompatibilityDate()}"
  `;
	writeFile(wranglerTomlPath, wranglerToml);
}

export async function appendToWranglerToml(ctx: C3Context, content: string) {
	if (ctx.template.platform !== "workers") {
		return;
	}

	const wranglerTomlPath = resolve(ctx.project.path, "wrangler.toml");
	appendFile(wranglerTomlPath, content);
}

async function installWorkersTypes(ctx: C3Context) {
	if (!usesTypescript(ctx)) {
		return;
	}

	await installPackages(["@cloudflare/workers-types"], {
		dev: true,
		startText: `Installing @cloudflare/workers-types`,
		doneText: `${brandColor("installed")} ${dim(`via ${npm}`)}`,
	});
	await updateTsConfig(ctx);
}

export async function updateTsConfig(ctx: C3Context) {
	const tsconfigPath = join(ctx.project.path, "tsconfig.json");
	if (!existsSync(tsconfigPath)) {
		return;
	}

	const s = spinner();
	s.start(`Adding latest types to \`tsconfig.json\``);

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
	const updated = tsconfig.replace(
		"@cloudflare/workers-types",
		typesEntrypoint
	);

	writeFile(tsconfigPath, updated);
	s.stop(`${brandColor("added")} ${dim(typesEntrypoint)}`);
}

// @cloudflare/workers-types are versioned by compatibility dates, so we must look
// up the latest entrypiont from the installed dependency on disk.
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
