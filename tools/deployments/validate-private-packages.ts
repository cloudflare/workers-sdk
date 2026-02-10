import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { glob } from "glob";
import type { PackageJSON } from "./validate-fixtures";

if (require.main === module) {
	console.log("::group::Checking package names");
	checkPrivatePackageScopes()
		.then((errors) => {
			if (errors.length > 0) {
				console.error(
					"::error::Package names checks:" + errors.map((e) => `\n- ${e}`)
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

async function getPrivatePackageJsons() {
	const packageJsonPaths = await glob("**/package.json", {
		cwd: resolve(__dirname, "../../"),
		ignore: [
			// We are not interested in dependencies
			"**/node_modules/**",
			// The package.jsons in the fixtures directory use the `@fixture/` scope
			// TODO: consider if we should use the `@cloudflare/` scope instead
			"fixtures/**",
			// C3 template package.jsons have placeholder names that are populated by C3 during the app creation
			"packages/create-cloudflare/templates/**",
			// The package.jsons in the vite-plugin playground use the `@playground/` scope
			// TODO: consider if we should use the `@cloudflare/` scope instead
			"packages/vite-plugin-cloudflare/playground/**",
			// We are not interested in vendor sub-packages
			"vendor/**",
		],
	});
	return (
		packageJsonPaths
			.map((packageJson) => {
				const resolved = resolve(packageJson);
				return {
					dir: dirname(resolved),
					packageJson: JSON.parse(
						readFileSync(packageJson, "utf-8")
					) as PackageJSON,
				};
			})
			// We are only interested in private packages
			.filter(({ packageJson }) => packageJson.private)
	);
}

/**
 * Ensures that private packages are all scoped to `@cloudflare/`.
 */
async function checkPrivatePackageScopes(): Promise<string[]> {
	const relevantPackageJsons = await getPrivatePackageJsons();
	const errors: string[] = [];
	for (const { dir, packageJson } of relevantPackageJsons) {
		console.log(`- ${dir}`);

		if (!packageJson.name.startsWith("@cloudflare/")) {
			errors.push(
				`Private package in directory "${dir}" has a name that does not start with "@cloudflare/". Please rename it to start with "@cloudflare/".`
			);
		}
	}
	return errors;
}
