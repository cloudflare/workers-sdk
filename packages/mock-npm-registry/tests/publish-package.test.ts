import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import getPort from "get-port";
import { describe, onTestFinished, test, vi } from "vitest";
import { packageManager } from "../../../package.json";
import { publishPackage, restoreLatestTag } from "../src/publish-package";
import type { LocalVersion } from "../src/local-versions";

const name = "@cloudflare/mock-npm-registry-dist-tag-test";

/**
 * Start a fake upstream npm registry that has a single stable version (1.0.0)
 * of the test package.
 */
async function startUpstream() {
	const upstreamPort = await getPort();
	const upstreamUrl = `http://127.0.0.1:${upstreamPort}/`;
	const stable = {
		name,
		version: "1.0.0",
		dist: {
			tarball: `${upstreamUrl}stable.tgz`,
			shasum: "0".repeat(40),
		},
	};
	const upstream = createServer((request, response) => {
		response.setHeader("content-type", "application/json");
		response.end(
			JSON.stringify(
				request.url?.endsWith("/latest")
					? stable
					: {
							name,
							versions: { "1.0.0": stable },
							"dist-tags": { latest: "1.0.0" },
						}
			)
		);
	});
	upstream.listen(upstreamPort, "127.0.0.1");
	await once(upstream, "listening");
	onTestFinished(
		() =>
			new Promise<void>((resolve, reject) => {
				upstream.close((error) => (error ? reject(error) : resolve()));
			})
	);
	return upstreamUrl;
}

/**
 * Configure a local Verdaccio registry, which proxies to `upstreamUrl` when
 * started with uplinks.
 */
async function setUpRegistry(upstreamUrl: string) {
	const port = await getPort();
	const registry = `http://127.0.0.1:${port}/`;
	const configPath = path.resolve("verdaccio.yaml");
	const npmrc = path.resolve(".npmrc");
	writeFileSync(
		npmrc,
		`registry=${registry}\n//127.0.0.1:${port}/:_authToken=xxxx\ngit-checks=false\n`
	);
	vi.stubEnv("NPM_CONFIG_USERCONFIG", npmrc);
	vi.stubEnv("npm_config_userconfig", npmrc);
	vi.stubEnv("npm_config_registry", registry);

	let stopCurrent: (() => Promise<void>) | undefined;
	onTestFinished(() => stopCurrent?.());

	async function start(withUplinks: boolean) {
		await stopCurrent?.();
		writeFileSync(
			configPath,
			JSON.stringify({
				listen: `127.0.0.1:${port}`,
				storage: path.resolve("storage"),
				uplinks: { npmJS: { url: upstreamUrl } },
				packages: {
					"**": {
						access: "$all",
						publish: "$all",
						...(withUplinks ? { proxy: "npmJS" } : {}),
					},
				},
				log: { type: "stdout", format: "pretty", level: "error" },
			})
		);
		const server = fork(
			require.resolve("verdaccio/bin/verdaccio"),
			["-c", configPath],
			{ stdio: "ignore" }
		);
		const exited = new Promise<void>((resolve) => {
			server.once("exit", () => resolve());
		});
		await once(server, "message");
		stopCurrent = async () => {
			server.kill();
			await exited;
			stopCurrent = undefined;
		};
	}

	return { registry, start };
}

/** Write a package fixture to publish. */
function writeFixture(manifest: Record<string, unknown>) {
	const packagePath = path.resolve("package");
	mkdirSync(packagePath, { recursive: true });
	writeFileSync(path.join(packagePath, "index.js"), "module.exports = {};\n");
	writeFileSync(
		path.join(packagePath, "package.json"),
		JSON.stringify({ packageManager, files: ["index.js"], ...manifest })
	);
	return packagePath;
}

async function getMetadata(registry: string, packageName: string) {
	const response = await fetch(
		new URL(encodeURIComponent(packageName), registry)
	);
	return (await response.json()) as {
		"dist-tags": Record<string, string>;
		versions: Record<
			string,
			{ dependencies?: Record<string, string>; dist: { tarball: string } }
		>;
	};
}

describe("publishPackage", () => {
	runInTempDir();

	test("keeps prerelease tags local and latest on the upstream stable version", async ({
		expect,
	}) => {
		const upstreamUrl = await startUpstream();
		const { registry, start } = await setUpRegistry(upstreamUrl);
		await start(false);

		async function publishFixture(
			version: string,
			tag?: string,
			packageName = name
		) {
			const packagePath = writeFixture({
				name: packageName,
				version,
				publishConfig: { registry },
				"workers-sdk": tag
					? { npmPrerelease: { tag, numbered: true } }
					: { prerelease: true },
			});
			return publishPackage(packagePath, { stdio: "ignore" });
		}
		expect(
			await publishFixture("1.0.0", undefined, "stable-test-package")
		).toEqual({ version: "1.0.0", tag: "latest" });
		expect(await publishFixture("2.0.0-beta.0", "beta")).toEqual({
			version: "2.0.0-beta.0",
			tag: "beta",
		});
		expect(await publishFixture("2.0.0-rc.0", "rc")).toEqual({
			version: "2.0.0-rc.0",
			tag: "rc",
		});

		await expect(
			publishPackage(path.resolve("package"), { stdio: "ignore" })
		).rejects.toThrow("pnpm publish");

		await start(true);
		await restoreLatestTag(name, registry, upstreamUrl);

		const tagsUrl = new URL(
			`/-/package/${encodeURIComponent(name)}/dist-tags`,
			registry
		);
		const tags = await fetch(tagsUrl);
		expect(await tags.json()).toEqual({
			latest: "1.0.0",
			beta: "2.0.0-beta.0",
			rc: "2.0.0-rc.0",
		});
	});

	test("publishes local dependencies alongside the upstream version they share", async ({
		expect,
	}) => {
		const upstreamUrl = await startUpstream();
		const { registry, start } = await setUpRegistry(upstreamUrl);
		await start(false);

		// The local package has the same version as its upstream release.
		const localVersions = new Map<string, LocalVersion>([
			[name, { from: "1.0.0", to: "0.0.0-local.1.0.0" }],
		]);
		const dependencyManifest = {
			name,
			version: "1.0.0",
			publishConfig: { registry },
		};
		const dependencyPath = writeFixture(dependencyManifest);
		expect(
			await publishPackage(dependencyPath, { stdio: "ignore", localVersions })
		).toEqual({ version: "0.0.0-local.1.0.0", tag: "local" });
		// The package's own files are left alone.
		expect(
			JSON.parse(
				readFileSync(path.join(dependencyPath, "package.json"), "utf8")
			)
		).toMatchObject(dependencyManifest);

		// A target package depends on the local version of its dependency.
		const targetPath = writeFixture({
			name: "target-test-package",
			version: "3.0.0",
			publishConfig: { registry },
			// `pnpm pack` would resolve `workspace:*` to this exact version.
			dependencies: { [name]: "1.0.0" },
		});
		expect(
			await publishPackage(targetPath, { stdio: "ignore", localVersions })
		).toEqual({ version: "3.0.0", tag: "latest" });

		await start(true);
		await restoreLatestTag(name, registry, upstreamUrl);

		const target = await getMetadata(registry, "target-test-package");
		expect(target["dist-tags"]).toEqual({ latest: "3.0.0" });
		expect(target.versions["3.0.0"].dependencies).toEqual({
			[name]: "0.0.0-local.1.0.0",
		});

		// Anything that depends on `1.0.0`, or `latest`, gets the upstream copy.
		const dependency = await getMetadata(registry, name);
		expect(dependency["dist-tags"]).toEqual({
			latest: "1.0.0",
			local: "0.0.0-local.1.0.0",
		});
		expect(Object.keys(dependency.versions).sort()).toEqual([
			"0.0.0-local.1.0.0",
			"1.0.0",
		]);
		// Verdaccio proxies upstream tarballs under their upstream file name.
		expect(dependency.versions["1.0.0"].dist.tarball).toMatch(
			/\/-\/stable\.tgz$/
		);
		expect(dependency.versions["0.0.0-local.1.0.0"].dist.tarball).toMatch(
			/\/-\/mock-npm-registry-dist-tag-test-0\.0\.0-local\.1\.0\.0\.tgz$/
		);
	});
});
