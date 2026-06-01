/**
 * Validates that all non-bundled dependencies of published packages are pinned
 * to exact versions.
 *
 * Anything a published package does not bundle is installed into the consumer's
 * dependency tree at install time. If those specifiers are ranges, a malicious
 * or broken upstream release can be pulled into users' installs without us
 * having a chance to vet it. Pinning to exact versions locks down exactly what
 * ships. (devDependencies are intentionally NOT checked: npm never installs a
 * published package's devDependencies into a consumer's tree, so their
 * specifiers cannot affect users.)
 *
 * The check has two halves:
 *
 *   1. Catalog pinning — every entry in the `catalog:` block of
 *      pnpm-workspace.yaml must be an exact version. Because the catalog is
 *      guaranteed pinned, any `catalog:` reference elsewhere is trusted and
 *      doesn't need to be resolved per-package.
 *
 *   2. Package pinning — in every published (non-private) package, every
 *      `dependencies` and `optionalDependencies` entry must be an exact
 *      version. Specifiers using `workspace:`, `catalog:`, `npm:`, `link:` or
 *      `file:` are skipped (the catalog ones are covered by half 1; workspace
 *      ones are released atomically with the monorepo). `peerDependencies` are
 *      excluded because ranges there are intentional and generally necessary.
 */

import { loadCatalog } from "./validate-catalog-usage";
import {
	getPublicPackages,
	type PackageJSON,
} from "./validate-package-dependencies";

/**
 * Matches an exact semantic version: MAJOR.MINOR.PATCH with optional
 * `-prerelease` and `+build` metadata (e.g. "1.2.3", "4.1.0-beta.10",
 * "2.0.0-rc.24"). Rejects ranges (^, ~, >, <, ||, hyphen ranges), wildcards
 * (*, x), and partial versions.
 */
const PINNED_VERSION_RE =
	/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;

/**
 * Specifier prefixes that are not literal version pins. These are validated
 * elsewhere (catalog entries by `validateCatalogPins`) or are released
 * atomically with the monorepo (workspace), so they are skipped here.
 */
const NON_LITERAL_PREFIXES = [
	"workspace:",
	"catalog:",
	"npm:",
	"link:",
	"file:",
];

/**
 * Catalog entries that are deliberately left as ranges.
 *
 * `@cloudflare/workers-types` is consumed as an (optional) peerDependency via
 * `catalog:default`. A range is intentional there so consumers aren't forced
 * onto a single exact version of the types package.
 */
export const CATALOG_PIN_EXCEPTIONS = new Set(["@cloudflare/workers-types"]);

export function isPinnedVersion(version: string): boolean {
	return PINNED_VERSION_RE.test(version);
}

function isNonLiteralSpecifier(version: string): boolean {
	return NON_LITERAL_PREFIXES.some((prefix) => version.startsWith(prefix));
}

/**
 * Validates that every catalog entry is pinned to an exact version (except
 * deliberately-ranged entries in the exceptions allowlist).
 */
export function validateCatalogPins(
	catalog: Map<string, string>,
	exceptions: Set<string> = CATALOG_PIN_EXCEPTIONS
): string[] {
	const errors: string[] = [];

	for (const [name, version] of catalog) {
		if (exceptions.has(name)) {
			continue;
		}
		if (!isPinnedVersion(version)) {
			errors.push(
				`Catalog entry "${name}" uses "${version}" but must be pinned to an exact ` +
					`version in pnpm-workspace.yaml (e.g. "1.2.3", not a range). Catalog entries ` +
					`can be consumed as non-bundled dependencies, so their versions must be locked down.`
			);
		}
	}

	return errors;
}

/**
 * Validates that a single package's non-bundled dependencies are pinned.
 * Returns an array of error messages (empty if valid).
 */
export function validatePackagePins(
	packageName: string,
	relativePath: string,
	packageJson: PackageJSON
): string[] {
	const errors: string[] = [];
	const sections = ["dependencies", "optionalDependencies"] as const;

	for (const section of sections) {
		const deps = packageJson[section];
		if (!deps) {
			continue;
		}
		for (const [name, version] of Object.entries(deps)) {
			if (isNonLiteralSpecifier(version)) {
				continue;
			}
			if (!isPinnedVersion(version)) {
				errors.push(
					`Package "${packageName}" has ${section} "${name}" set to "${version}" ` +
						`(packages/${relativePath}/package.json), but non-bundled dependencies must be ` +
						`pinned to an exact version (e.g. "1.2.3", not a range). If it should be ` +
						`sourced from the pnpm catalog, use "catalog:default" instead.`
				);
			}
		}
	}

	return errors;
}

/**
 * Validates that all catalog entries and all published packages' non-bundled
 * dependencies are pinned to exact versions.
 */
export async function checkPinnedDependencies(): Promise<string[]> {
	const errors: string[] = [];

	console.log("- catalog (pnpm-workspace.yaml)");
	errors.push(...validateCatalogPins(loadCatalog()));

	const packages = await getPublicPackages();
	for (const { dir, packageJson } of packages) {
		const relativePath = dir.split("/packages/")[1];
		console.log(`- ${packageJson.name}`);
		errors.push(
			...validatePackagePins(packageJson.name, relativePath, packageJson)
		);
	}

	return errors;
}

if (require.main === module) {
	console.log("::group::Checking dependency version pinning");
	checkPinnedDependencies()
		.then((errors) => {
			if (errors.length > 0) {
				console.error(
					"::error::Dependency pinning checks:" +
						errors.map((e) => `\n- ${e}`).join("")
				);
			}
			console.log("::endgroup::");
			process.exit(errors.length > 0 ? 1 : 0);
		})
		.catch((error) => {
			console.log("::endgroup::");
			console.error("An unexpected error occurred", error);
			process.exit(1);
		});
}
