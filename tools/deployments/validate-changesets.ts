import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import parseChangeset from "@changesets/parse";

if (require.main === module) {
	const packageNames = findPackageNames();
	const changesets = readChangesets(resolve(__dirname, "../../.changeset"));
	const errors = validateChangesets(packageNames, changesets);
	if (errors.length > 0) {
		console.error("Validation errors in changesets:");
		for (const error of errors) {
			console.error("- ", error);
		}
		process.exit(1);
	}
}

export function validateChangesets(
	packageNames: Set<string>,
	changesets: ChangesetFile[]
) {
	const errors: string[] = [];
	changesets.map(({ file, contents }) => {
		try {
			const changeset = parseChangeset(contents);
			for (const release of changeset.releases) {
				if (!packageNames.has(release.name)) {
					errors.push(
						`Invalid package name "${release.name}" in changeset at "${file}".`
					);
				}
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
export function findPackageNames(): Set<string> {
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
	const deployablePackages = new Set<string>();
	for (const pkg of allPackages) {
		if (!pkg.private || pkg.scripts?.deploy !== undefined) {
			deployablePackages.add(pkg.name);
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
};
