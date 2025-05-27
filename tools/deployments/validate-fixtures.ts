import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

if (require.main === module) {
	console.log("::group::Checking fixtures");
	const errors = checkFixtures();
	if (errors.length > 0) {
		console.error("::error::Fixture checks:" + errors.map((e) => `\n- ${e}`));
	}
	console.log("::endgroup::");
	process.exit(errors.length > 0 ? 1 : 0);
}

function getFixtures() {
	const fixturesDirectory = resolve(__dirname, "../../fixtures");
	const allFixtureDirectories = readdirSync(fixturesDirectory);
	return allFixtureDirectories
		.map((dir) => {
			return {
				dir,
				packageJson: resolve(fixturesDirectory, dir, "package.json"),
			};
		})
		.filter(({ packageJson }) => {
			return existsSync(packageJson);
		});
}

/**
 * Ensures that we don't accidentally create git tags and releases for fixtures
 * by someone inadvertently adding a version to their package.json or making them non-private.
 *
 * Check the package.json for each fixture and ensure that they are all private and have no `version` property.
 */
export function checkFixtures(): string[] {
	const allFixtures = getFixtures();
	const errors: string[] = [];
	for (const { dir, packageJson } of allFixtures) {
		try {
			console.log(`- ${dir}`);
			const fixturePackage = JSON.parse(
				readFileSync(packageJson, "utf-8")
			) as PackageJSON;

			// Check the package is not deployable.
			if (fixturePackage.private !== true) {
				errors.push(
					`Fixture "${dir}" is not private. Add \`"private": true\` to its package.json`
				);
			}

			// Check the package does not have a version.
			if (fixturePackage.version) {
				errors.push(
					`Fixture "${dir}" has the disallowed "version" property. Please remove this.`
				);
			}

			// Check the package has a name starting with "fixture-".
			if (!fixturePackage.name.startsWith("fixture-")) {
				errors.push(
					`Fixture in directory "fixtures/${dir}" has a name that does not start with "fixture-". Please rename it to start with "fixture-".`
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
