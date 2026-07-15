import childProcess, { execSync } from "node:child_process";
import fs, { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import util from "node:util";
import { removeDir } from "@cloudflare/workers-utils";
import getPort from "get-port";
import treeKill from "tree-kill";
import { dedent } from "ts-dedent";
import { ConfigBuilder } from "verdaccio";

const debugLog = util.debuglog("mock-npm-registry");
const repoRoot = path.resolve(__dirname, "../../..");

/**
 * Start a mock local npm registry (using verdaccio) to host local copies of packages under test.
 *
 * The `targetPackages` will be published to the local npm repository along with any of their local dependencies.
 * Any non-local dependencies will continue to be pulled from the public npm registry.
 *
 * @param targetPackages a list of primary packages to publish to the local registry.
 * @returns a function that stops and deletes the registry
 */
export async function startMockNpmRegistry(...targetPackages: string[]) {
	// The directory where we will put the verdaccio config and database.
	const registryPath = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "local-npm-registry-"))
	);

	// The port that the verdaccio on which the server will run.
	const registryPort = await getPort();

	// The packages to publish to the local npm repository.
	const pkgs = await getPackagesToPublish(targetPackages);

	const configPath = await writeVerdaccioConfig(
		registryPath,
		registryPort,
		pkgs,
		{ withUplinks: false }
	);

	console.log(
		`Starting up local npm registry on http://localhost:${registryPort} at ${registryPath} with ${pkgs.size} packages published:`
	);

	for (const [pkg, pkgPath] of pkgs.entries()) {
		console.log(` - ${pkg} (${pkgPath})`);
	}

	let stopServer = await startVerdaccioServer(configPath);

	const tempConfig = path.join(registryPath, ".npmrc");
	await writeFile(
		tempConfig,
		dedent`
			registry=http://localhost:${registryPort}
			//localhost:${registryPort}/:_authToken=xxxx-xxxx-xxxx-xxxx
	`
	);

	// pnpm reads array settings such as `minimumReleaseAgeExclude` only from a
	// config *file* (never from an env var), and the file differs by pnpm major:
	// pnpm 10 reads the global `<configDir>/rc` (npmrc/INI), while pnpm 11 reads
	// the global `<configDir>/config.yaml`. `<configDir>` resolves to
	// `$XDG_CONFIG_HOME/pnpm` on all platforms when XDG_CONFIG_HOME is set, so we
	// write both files into an isolated config dir and point pnpm at it below.
	// Freshly-published first-party packages carry a "now" timestamp, so the
	// inherited `minimumReleaseAge` cooldown (leaked from the workspace via the
	// `npm_config_minimum_release_age` env var) would otherwise reject them.
	// Excluding them by name installs their local versions while the cooldown
	// still applies to third-party deps pulled via the npm uplink.
	const configHome = path.join(registryPath, "config");
	const pnpmConfigDir = path.join(configHome, "pnpm");
	await fs.mkdir(pnpmConfigDir, { recursive: true });
	const minimumReleaseAgeExclude = [
		...pkgs.keys(),
		// workerd and @cloudflare/workers-types are pulled in transitively (e.g.
		// via miniflare) and may have been bumped same-day. Keep this list in sync
		// with `minimumReleaseAgeExclude` in the root pnpm-workspace.yaml.
		"workerd",
		"@cloudflare/workerd-*",
		"@cloudflare/workers-types",
	];
	// pnpm 10 reads this from the npmrc/INI-format global `rc` file.
	await writeFile(
		path.join(pnpmConfigDir, "rc"),
		minimumReleaseAgeExclude
			.map((name) => `minimum-release-age-exclude[]=${name}`)
			.join("\n") + "\n"
	);
	// pnpm 11 reads this from the YAML global `config.yaml` file. Quote the
	// scalars so leading `@` / `*` aren't misparsed by the YAML loader.
	await writeFile(
		path.join(pnpmConfigDir, "config.yaml"),
		[
			"minimumReleaseAgeExclude:",
			...minimumReleaseAgeExclude.map((name) => `  - "${name}"`),
		].join("\n") + "\n"
	);

	if (debugLog.enabled) {
		debugLog("Original");
		debugLog(execSync("pnpm config list", { encoding: "utf8" }));
	}

	const revert_NPM_CONFIG_USERCONFIG = overrideProcessEnv(
		"NPM_CONFIG_USERCONFIG",
		tempConfig
	);
	const revert_npm_config_userconfig = overrideProcessEnv(
		"npm_config_userconfig",
		tempConfig
	);
	const revert_npm_config_registry = overrideProcessEnv(
		"npm_config_registry",
		`http://localhost:${registryPort}`
	);
	// Point pnpm at the isolated config dir written above so its
	// `minimumReleaseAgeExclude` list is honored. The scalar
	// `npm_config_minimum_release_age` inherited from the parent `pnpm run`
	// still applies to third-party deps; the two settings merge because they are
	// different keys. (An array cannot be passed via a single env var, and pnpm
	// only reads this setting from config files — hence the redirect.)
	const revert_XDG_CONFIG_HOME = overrideProcessEnv(
		"XDG_CONFIG_HOME",
		configHome
	);

	if (debugLog.enabled) {
		debugLog("Updated");
		debugLog(execSync("pnpm config list", { encoding: "utf8" }));
	}

	for (const [pkgName, pkgPath] of pkgs) {
		debugLog("Publishing package " + pkgName);
		execSync("pnpm publish", {
			cwd: path.join(repoRoot, pkgPath),
			stdio: debugLog.enabled ? "inherit" : "ignore",
		});
	}

	// Rewrite the config to turn on uplinks for doing installs
	// and restart the server.
	await writeVerdaccioConfig(registryPath, registryPort, pkgs, {
		withUplinks: true,
	});
	await stopServer();
	stopServer = await startVerdaccioServer(configPath);

	return async function stop() {
		console.log("Stopping local npm registry");
		await stopServer();

		revert_NPM_CONFIG_USERCONFIG();
		revert_npm_config_registry();
		revert_npm_config_userconfig();
		revert_XDG_CONFIG_HOME();
		if (debugLog.enabled) {
			debugLog("After");
			debugLog(execSync("pnpm config list", { encoding: "utf8" }));
		}
		await removeDir(registryPath);
	};
}

type PackageInfo = { name: string; path: string };

/**
 * Generate a map (name => path) of local packages that need to be published to the mock npm registry
 * from a list of "entry-point" package `names`.
 *
 * Uses `turbo query` to work out the dependencies of all the entry-point packages.
 *
 * @param names A list of all the entry-point package names.
 */
async function getPackagesToPublish(names: string[]) {
	const tmpPath = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "turbo-repo-query"))
	);
	const deployableDeps = new Map<string, string>();
	try {
		const turboQueryPath = path.join(tmpPath, "turbo.deps.gql");
		for (const name of names) {
			await fs.writeFile(
				turboQueryPath,
				`{ package(name: "${name}") { path, allDependencies { items { name, path } } } }`
			);
			const results = JSON.parse(
				// eslint-disable-next-line workers-sdk/no-unsafe-command-execution -- The following command uses turboQueryPath which is a path we computed so it is safe to run
				execSync("pnpm exec turbo query " + turboQueryPath, {
					encoding: "utf8",
					stdio: "pipe",
				})
			);

			const packagePath = results.data.package.path as string;
			const allDeps = results.data.package.allDependencies
				.items as PackageInfo[];
			for await (const dep of allDeps) {
				const pkg = JSON.parse(
					await fs.readFile(
						path.join(repoRoot, dep.path, "package.json"),
						"utf-8"
					)
				);
				if (!pkg.private) {
					deployableDeps.set(dep.name, dep.path);
				}
			}

			// Push the target package too.
			deployableDeps.set(name, packagePath);
		}

		return deployableDeps;
	} finally {
		await removeDir(tmpPath);
	}
}

/**
 * Generate a verdaccio configuration file.
 *
 * There are two modes for this configuration: `withUplinks` true/false.
 * - We need `withUplinks` to be false when publishing local packages,
 *   otherwise npm will complain that the package already exists.
 * - We need `withUplinks` to be false when installing local packages,
 *   otherwise old versions of locally published packages will not be found,
 *   since there would be no fallback to public npm.
 *
 * @param registryPath The path to a directory that will contain locally published packages
 * @param registryPort The port on which the verdaccio server will listen
 * @param pkgs A map (name -> path) of the packages that will be hosted locally
 * @param options.withUplinks Control whether the server will fallback to the real npm registry
 * @returns a Promise to the path to the generated configuration file.
 */
async function writeVerdaccioConfig(
	registryPath: string,
	registryPort: number,
	pkgs: Map<string, string>,
	options: { withUplinks: boolean }
) {
	const config = ConfigBuilder.build({
		// @ts-expect-error the `listen` property can also be a simple string.
		listen: `localhost:${registryPort}`,
		storage: "./storage",
		// Raise the publish payload limit well above Verdaccio's 10mb default.
		// Workspace packages such as `wrangler` produce tarballs (with source
		// maps and metafiles) whose base64-encoded JSON publish body now
		// exceeds the default, causing HTTP 413 from `pnpm publish`.
		max_body_size: "100mb",
		uplinks: {
			// Consider adding the Cloudflare internal mirror registry too.
			npmJS: { url: "https://registry.npmjs.org/" },
		},
		log: {
			type: "stdout",
			format: "pretty",
			level: debugLog.enabled ? "info" : "error",
		},
	});
	for (const pkg of pkgs.keys()) {
		config.addPackageAccess(pkg, {
			access: "$all",
			publish: "$all",
			...(options.withUplinks ? { proxy: "npmJS" } : {}),
		});
	}
	// All other packages should be pulled from the official npm registry
	config.addPackageAccess("**", { access: "$all", proxy: "npmJS" });

	const configPath = path.join(registryPath, "verdaccio.config.yaml");
	await fs.writeFile(configPath, config.getAsYaml());

	return configPath;
}

/**
 * Start Verdaccio with the configuration found at the given configPath.
 *
 * @param configPath absolute to the path containing the verdaccio configuration.
 * @returns a Promise to a function that can be used to stop the server.
 */
async function startVerdaccioServer(configPath: string) {
	return new Promise<() => Promise<void>>((resolve, reject) => {
		const server = childProcess.fork(
			require.resolve("verdaccio/bin/verdaccio"),
			["-c", configPath]
		);
		server.on("error", reject);
		server.on("disconnect", reject);

		server.stdout?.on("data", (chunk) => debugLog(chunk.toString()));
		server.stderr?.on("data", (chunk) => debugLog(chunk.toString()));
		server.on("message", (msg: { verdaccio_started: boolean }) => {
			if (msg.verdaccio_started) {
				server.off("error", reject);
				server.off("disconnect", reject);
				resolve(stop);
			}
		});

		function stop() {
			return new Promise<void>((res) => {
				if (server?.pid) {
					treeKill(server.pid, () => res());
				} else {
					res();
				}
			});
		}
	});
}

/**
 * Override the given process.env value and return function that can revert the override.
 */
function overrideProcessEnv(envName: string, overrideValue: string) {
	const shouldDelete = !(envName in process.env);
	const originalValue = process.env[envName];
	process.env[envName] = overrideValue;
	return function revert() {
		if (shouldDelete) {
			delete process.env[envName];
		} else {
			process.env[envName] = originalValue;
		}
	};
}
