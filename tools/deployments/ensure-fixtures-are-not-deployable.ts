import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

if (require.main === module) {
	console.log("::group::Checking fixtures");
	const errors = ensureFixturesAreNotDeployable();
	if (errors.length > 0) {
		console.error("::error::Fixture checks:" + errors.map((e) => `\n- ${e}`));
	}
	console.log("::endgroup::");
	process.exit(errors.length > 0 ? 1 : 0);
}

/**
 * Ensures that we don't accidentally create git tags and releases for fixtures
 * by someone inadvertently adding a version to their package.json or making them non-private.
 *
 * Check the package.json for each fixture and ensure that they are all private and have no `version` property.
 */
export function ensureFixturesAreNotDeployable(): string[] {
	const fixturesDirectory = resolve(__dirname, "../../fixtures");
	const allFixtureDirectories = readdirSync(fixturesDirectory);
	const errors: string[] = [];
	for (const dir of allFixtureDirectories) {
		try {
			console.log(`- ${dir}`);
			const packageJSONPath = resolve(fixturesDirectory, dir, "package.json");
			if (!existsSync(packageJSONPath)) {
				continue;
			}
			const fixturePackage = JSON.parse(
				readFileSync(packageJSONPath, "utf-8")
			) as PackageJSON;
			if (fixturePackage.private !== true) {
				errors.push(
					`Fixture "${dir}" is not private. Add \`"private": true\` to its package.json`
				);
			}
			if (fixturePackage.version) {
				errors.push(
					`Fixture "${dir}" has the disallowed "version" property. Please remove this.`
				);
			}
		} catch {
			errors.push(
				`Unable to load or parse fixture "${dir}" package. Please check it has a valid package.json.`
			);
		}
	}
	return errors;
}

export type PackageJSON = {
	name: string;
	private?: boolean;
	version?: string;
};
