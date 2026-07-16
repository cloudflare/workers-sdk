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

/**
 * Parses the `catalog:` block of a pnpm-workspace.yaml into a map of
 * dependency name -> version specifier.
 */
export function parseCatalog(workspaceYaml: string): Map<string, string> {
	const catalog = new Map<string, string>();
	let inCatalog = false;

	for (const line of workspaceYaml.split("\n")) {
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

		const match = trimmed.match(
			/^["']?(@?[^"':]+)["']?\s*:\s*["']?([^"'#\s]+)["']?/
		);
		if (match) {
			catalog.set(match[1].trim(), match[2]);
		}
	}

	return catalog;
}

/**
 * Loads the pnpm catalog as a map of dependency name -> version specifier.
 */
export function loadCatalog(): Map<string, string> {
	const content = readFileSync(resolve(ROOT, "pnpm-workspace.yaml"), "utf-8");
	return parseCatalog(content);
}

function loadCatalogDeps(): Set<string> {
	return new Set(loadCatalog().keys());
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

if (require.main === module) {
	main().catch((error) => {
		console.log("::endgroup::");
		console.error("An unexpected error occurred", error);
		process.exit(1);
	});
}
