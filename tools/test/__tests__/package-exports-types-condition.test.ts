import { readFileSync } from "node:fs";
import path from "node:path";
import { globSync } from "tinyglobby";
import { describe, expect, it } from "vitest";

const repository = path.resolve(__dirname, "../../..");

/** Every workspace package under `packages/` that declares `exports`. */
const packages = globSync("packages/*/package.json", {
	cwd: repository,
	ignore: ["**/node_modules/**"],
})
	.sort()
	.map((manifestPath) => {
		const manifest = JSON.parse(
			readFileSync(path.join(repository, manifestPath), "utf8")
		) as { name: string; exports?: unknown };
		return { name: manifest.name, manifestPath, exports: manifest.exports };
	})
	.filter(({ exports }) => exports !== undefined);

/**
 * Lists every conditions object in an `exports` map that has a `types`
 * condition anywhere but first, with the order its conditions appear in.
 */
function misorderedTypesConditions(
	exportsField: unknown,
	location = "exports"
): string[] {
	if (
		exportsField === null ||
		typeof exportsField !== "object" ||
		Array.isArray(exportsField)
	) {
		return [];
	}
	const keys = Object.keys(exportsField);
	const found =
		keys.includes("types") && keys[0] !== "types"
			? [`${location}: ${keys.join(", ")}`]
			: [];
	for (const [key, value] of Object.entries(exportsField)) {
		found.push(...misorderedTypesConditions(value, `${location}["${key}"]`));
	}
	return found;
}

describe("package.json exports", () => {
	// Node.js resolves conditions in the order they appear, and its docs say the
	// "types" condition "should always be included first":
	// https://nodejs.org/api/packages.html#community-conditions-definitions
	// See https://github.com/cloudflare/workers-sdk/issues/17029
	it.each(packages)(
		"$name lists the `types` condition first",
		({ exports }) => {
			expect(misorderedTypesConditions(exports)).toEqual([]);
		}
	);
});
