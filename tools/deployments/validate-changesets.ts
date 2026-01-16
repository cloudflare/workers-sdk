import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import parseChangeset from "@changesets/parse";

if (require.main === module) {
	const packages = findPackages();
	const changesets = readChangesets(resolve(__dirname, "../../.changeset"));
	const errors = validateChangesets(packages, changesets);
	if (errors.length > 0) {
		console.error("Validation errors in changesets:");
		for (const error of errors) {
			console.error("- ", error);
		}
		process.exit(1);
	}
}

export function validateChangesets(
	packages: Map<string, PackageJSON>,
	changesets: ChangesetFile[]
) {
	const errors: string[] = [];
	changesets.map(({ file, contents }) => {
		try {
			const changeset = parseChangeset(contents);
			for (const release of changeset.releases) {
				if (!packages.has(release.name)) {
					errors.push(
						`Unknown package name "${release.name}" in changeset at "${file}".`
					);
				}

				// TEMPORARILY BLOCK PACKAGES THAT WOULD DEPLOY WORKERS
				const ALLOWED_PRIVATE_PACKAGES = [
					"@cloudflare/workers-shared",
					"@cloudflare/quick-edit",
					"@cloudflare/devprod-status-bot",
				];
				if (
					packages.get(release.name)?.["workers-sdk"]?.deploy &&
					// Exception: deployments for these workers are allowed now
					!ALLOWED_PRIVATE_PACKAGES.includes(release.name)
				) {
					errors.push(
						`Currently we are not allowing changes to package "${release.name}" in changeset at "${file}" since it would trigger a Worker/Pages deployment.`
					);
				}
				// END TEMPORARILY BLOCK PACKAGES THAT WOULD DEPLOY WORKERS

				if (release.type === "major") {
					errors.push(
						`Major version bumps are not allowed for package "${release.name}" in changeset at "${file}".`
					);
				}
				if (!["minor", "patch", "none"].includes(release.type)) {
					errors.push(
						`Invalid type "${release.type}" for package "${release.name}" in changeset at "${file}".`
					);
				}
			}
		} catch (e) {
			if (e instanceof Error) {
				errors.push(e.toString() + `at file "${file}"`);
			} else {
				throw e;
			}
		}
	});
	return errors;
}

export function readChangesets(changesetDir: string): ChangesetFile[] {
	return readdirSync(changesetDir)
		.filter(
			(file) =>
				!file.startsWith(".") && file.endsWith(".md") && file !== "README.md"
		)
		.map((file) => ({
			file,
			contents: readFileSync(resolve(changesetDir, file), "utf-8"),
		}));
}

/**
 * Look for all the packages (under the top-level "packages" directory of the monorepo) that can have changesets.
 *
 * This is determined by the package containing a package.json that is public or
 * is marked as `"private": true` and has a `deploy` script.
 */
export function findPackages(): Map<string, PackageJSON> {
	const packagesDirectory = resolve(__dirname, "../../packages");
	const allPackageDirectories = readdirSync(packagesDirectory).map((p) =>
		resolve(packagesDirectory, p)
	);
	const allPackages: PackageJSON[] = [];
	for (const dir of allPackageDirectories) {
		try {
			allPackages.push(
				JSON.parse(readFileSync(resolve(dir, "package.json"), "utf-8"))
			);
		} catch {
			// Do nothing
		}
	}
	const deployablePackages = new Map<string, PackageJSON>();
	for (const pkg of allPackages) {
		if (!pkg.private || pkg.scripts?.deploy !== undefined) {
			deployablePackages.set(pkg.name, pkg);
		}
	}
	return deployablePackages;
}

export type ChangesetFile = {
	file: string;
	contents: string;
};

export type PackageJSON = {
	name: string;
	private?: boolean;
	scripts?: Record<string, unknown>;
	"workers-sdk"?: {
		deploy?: boolean;
	};
};
