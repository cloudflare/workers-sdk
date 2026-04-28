/**
 * Validates that workspace packages use `catalog:` references for any dependency
 * that exists in the pnpm catalog. Exceptions: `workspace:` refs, `npm:` aliases,
 * and packages under `templates/` (scaffolded for end users).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { glob } from "tinyglobby";

const ROOT = resolve(__dirname, "../..");

// Deps that are deliberately pinned outside the catalog (e.g. workerd is
// bumped in coordinated PRs with its own automation).
const IGNORED_DEPS = new Set(["workerd"]);

function loadCatalogDeps(): Set<string> {
	const content = readFileSync(resolve(ROOT, "pnpm-workspace.yaml"), "utf-8");
	const deps = new Set<string>();
	let inCatalog = false;

	for (const line of content.split("\n")) {
		if (line.startsWith("catalog:")) {
			inCatalog = true;
			continue;
		}
		if (inCatalog && /^\S/.test(line)) {
			break;
		}
		if (!inCatalog) {
			continue;
		}

		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#")) {
			continue;
		}

		const match = trimmed.match(/^["']?(@?[^"':]+)["']?\s*:/);
		if (match) {
			deps.add(match[1]);
		}
	}

	return deps;
}

async function main(): Promise<void> {
	console.log("::group::Checking catalog usage");

	const catalogDeps = loadCatalogDeps();
	const errors: string[] = [];

	const packageJsonPaths = await glob(
		[
			"package.json",
			"packages/*/package.json",
			"packages/vite-plugin-cloudflare/playground/*/package.json",
			"packages/vite-plugin-cloudflare/playground/package.json",
			"fixtures/*/package.json",
			"tools/package.json",
		],
		{ cwd: ROOT, absolute: true }
	);

	for (const pkgPath of packageJsonPaths) {
		if (pkgPath.includes("/templates/")) {
			continue;
		}

		const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
		const rel = pkgPath.replace(ROOT + "/", "");

		for (const section of ["dependencies", "devDependencies"] as const) {
			for (const [name, version] of Object.entries(
				(pkg[section] ?? {}) as Record<string, string>
			)) {
				if (
					!catalogDeps.has(name) ||
					IGNORED_DEPS.has(name) ||
					version.startsWith("catalog:") ||
					version.startsWith("workspace:") ||
					version.startsWith("npm:")
				) {
					continue;
				}

				errors.push(
					`${rel}: "${name}" uses "${version}" in ${section} but should use "catalog:default"`
				);
			}
		}
	}

	if (errors.length > 0) {
		console.error(
			"::error::Catalog usage violations:" +
				errors.map((e) => `\n- ${e}`).join("")
		);
	} else {
		console.log("All catalog dependencies are correctly referenced.");
	}

	console.log("::endgroup::");
	process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((error) => {
	console.log("::endgroup::");
	console.error("An unexpected error occurred", error);
	process.exit(1);
});
