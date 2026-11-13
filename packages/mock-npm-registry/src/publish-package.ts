import { execSync } from "node:child_process";
import { createReadStream } from "node:fs";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	realpath,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { removeDir } from "@cloudflare/workers-utils";
import { unpackTar } from "modern-tar/fs";
import { overrideConfigEnv } from "./config-env.js";
import { LOCAL_DIST_TAG, rewriteManifest } from "./local-versions.js";
import type { LocalVersion, PackageManifest } from "./local-versions.js";

type PackageJson = PackageManifest & {
	"workers-sdk"?: {
		npmPrerelease?: { tag: string };
	};
};

/**
 * Publish a workspace package to the registry configured in the environment.
 *
 * The package is packed (which resolves its `workspace:*` dependencies to exact
 * versions), then its manifest is rewritten so that it, and its dependencies on
 * other local packages, use the versions in `localVersions`. The package's own
 * files in the repository are never modified.
 *
 * A package that is renamed in `localVersions` is published under the `local`
 * dist-tag. Otherwise it uses its configured npm prerelease tag, or `latest`.
 *
 * @param packagePath The absolute path to the package directory.
 * @param options.stdio Whether to display the pack and publish commands' output.
 * @param options.localVersions The local packages to rename, keyed by name.
 * @returns The published version and the dist-tag it was published under.
 */
export async function publishPackage(
	packagePath: string,
	{
		stdio,
		localVersions = new Map(),
	}: {
		stdio: "inherit" | "ignore";
		localVersions?: ReadonlyMap<string, LocalVersion>;
	}
): Promise<{ version: string; tag: string }> {
	const workDir = await realpath(
		await mkdtemp(path.join(os.tmpdir(), "mock-npm-publish-"))
	);
	try {
		// eslint-disable-next-line workers-sdk/no-unsafe-command-execution -- workDir is a temporary directory we created
		execSync(`pnpm pack --pack-destination "${workDir}"`, {
			cwd: packagePath,
			stdio,
		});
		const tarballs = (await readdir(workDir)).filter((file) =>
			file.endsWith(".tgz")
		);
		if (tarballs.length !== 1) {
			throw new Error(
				`Expected \`pnpm pack\` to create one tarball for ${packagePath}, found ${tarballs.length}`
			);
		}

		const contentsPath = path.join(workDir, "package");
		await mkdir(contentsPath);
		await pipeline(
			createReadStream(path.join(workDir, tarballs[0])),
			createGunzip(),
			unpackTar(contentsPath, { strip: 1 })
		);

		const manifestPath = path.join(contentsPath, "package.json");
		const packed: PackageJson = JSON.parse(
			await readFile(manifestPath, "utf8")
		);
		const manifest = rewriteManifest(packed, localVersions);
		await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

		const tag = localVersions.has(packed.name)
			? LOCAL_DIST_TAG
			: (packed["workers-sdk"]?.npmPrerelease?.tag ?? "latest");
		// The lifecycle scripts already ran when the package was packed. Git
		// checks don't apply, since the contents aren't in a repository.
		execSync("pnpm publish --ignore-scripts --no-git-checks", {
			cwd: contentsPath,
			stdio,
			env: overrideConfigEnv(process.env, { tag }).env,
		});
		return { version: manifest.version, tag };
	} finally {
		await removeDir(workDir);
	}
}

/**
 * Restore a package's public `latest` tag after enabling npm uplinks, when it
 * was published under another dist-tag (a prerelease tag, or `local`).
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
