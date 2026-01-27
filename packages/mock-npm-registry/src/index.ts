import childProcess, { execSync } from "node:child_process";
import fs, { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import util from "node:util";
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
		if (debugLog.enabled) {
			debugLog("After");
			debugLog(execSync("pnpm config list", { encoding: "utf8" }));
		}
		await fs.rm(registryPath, { recursive: true, maxRetries: 10 });
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
				// eslint-disable-next-line workers-sdk/no-unsafe-command-execution
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
		await fs.rm(tmpPath, { recursive: true, maxRetries: 10 });
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
