import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { overrideConfigEnv } from "./config-env.js";

type PackageJson = {
	"workers-sdk"?: {
		npmPrerelease?: { tag: string };
	};
};

/**
 * Publish a workspace package using its configured npm prerelease tag, or `latest`.
 *
 * @param packagePath The absolute path to the package directory.
 * @param stdio Whether to display the publish command's output.
 * @returns The dist-tag used to publish the package.
 */
export async function publishPackage(
	packagePath: string,
	stdio: "inherit" | "ignore"
) {
	const pkg: PackageJson = JSON.parse(
		await readFile(path.join(packagePath, "package.json"), "utf8")
	);
	const tag = pkg["workers-sdk"]?.npmPrerelease?.tag ?? "latest";
	execSync("pnpm publish", {
		cwd: packagePath,
		stdio,
		env: overrideConfigEnv(process.env, { tag }).env,
	});
	return tag;
}

/**
 * Restore a prerelease package's public `latest` tag after enabling npm uplinks.
 *
 * Verdaccio assigns `latest` to the first local version, even for a prerelease,
 * and keeps whichever tag value is greater when merging upstream metadata.
 * Explicitly restoring npm's tag keeps stable installs on the public version.
 *
 * @param name The package name.
 * @param registry The URL of the local registry with uplinks enabled.
 * @param upstream The URL of the upstream npm registry.
 */
export async function restoreLatestTag(
	name: string,
	registry: string,
	upstream = "https://registry.npmjs.org/"
) {
	const packageName = encodeURIComponent(name);
	const latest = await fetch(new URL(`${packageName}/latest`, upstream));
	if (latest.status === 404) {
		return;
	}
	if (!latest.ok) {
		throw new Error(
			`Failed to read upstream latest tag for ${name}: ${latest.status}`
		);
	}
	const { version } = (await latest.json()) as { version: string };
	// Warm the uplink cache so Verdaccio accepts the public version as a tag target.
	const metadata = await fetch(new URL(packageName, registry));
	if (!metadata.ok) {
		throw new Error(
			`Failed to cache upstream versions for ${name}: ${metadata.status}`
		);
	}
	await metadata.arrayBuffer();
	const response = await fetch(
		new URL(`/-/package/${packageName}/dist-tags/latest`, registry),
		{
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(version),
		}
	);
	if (!response.ok) {
		throw new Error(
			`Failed to restore latest tag for ${name}: ${response.status}`
		);
	}
}
