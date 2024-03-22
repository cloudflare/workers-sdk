import fs from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";
import { getEnvironmentVariableFactory } from "../environment-variables/factory";
import { getGlobalWranglerConfigPath } from "../global-wrangler-config-path";
import { logger } from "../logger";
import { getPackageManager } from "../package-manager";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

type SupportedMajorVersions = "0.17" | "0.18" | "0.19" | "0.20";
type SupportedVersions = "0.17.19" | "0.18.20" | "0.19.11" | "0.20.2";

export * from "esbuild";
export type { default } from "esbuild";

type EsbuildAbstraction = typeof esbuild; // this type will evolve into an abstraction but for now the built-in version suffices

// setup the exports but with stubs that will throw an error if used before initialisation
export let { version, build, context, formatMessagesSync }: EsbuildAbstraction =
	esbuild;
function mutateExports(module: typeof esbuild) {
	({ version, build, context, formatMessagesSync } = module);
}

export async function setEsBuildVersion(
	args: Pick<
		StrictYargsOptionsToInterface<() => CommonYargsArgv>,
		| `experimentalEsbuild`
		| `experimentalEsbuild20`
		| "experimentalEsbuild19"
		| "experimentalEsbuild18"
		| "experimentalEsbuild17"
	>
) {
	let desiredMajorVersion: SupportedMajorVersions | undefined = undefined;

	// use the (latest) specific major the user selected
	if (args.experimentalEsbuild20) desiredMajorVersion = "0.20";
	else if (args.experimentalEsbuild19) desiredMajorVersion = "0.19";
	else if (args.experimentalEsbuild18) desiredMajorVersion = "0.18";
	else if (args.experimentalEsbuild17) desiredMajorVersion = "0.17";
	// if the user requested any "vnext", we decide the version
	else if (args.experimentalEsbuild) desiredMajorVersion = "0.20"; // TODO: this should be doable instead with yargs.implies

	if (desiredMajorVersion !== undefined) {
		// dynamically import the desired version
		const desiredVersion = mapMajorToSpecifiVersion(desiredMajorVersion);
		let module = await dynamicEsbuildImportMaxOnce(desiredVersion);
		module = massageVersionToContract(module);

		mutateExports(module);

		// only log if a dynamic imported version was used
		logger.warn(
			`Experimental usage of esbuild v${module.version}.\nPlease verify your Worker behaves correctly and, if not, file an issue on GitHub (https://github.com/cloudflare/workers-sdk/issues/new/choose) with a minimal reproduction.`
		);
	} else {
		// use the built-in version
		mutateExports(esbuild);
	}
}

// This function allows this module to control the specific supported versions (ideally one per major)
// without making the calling code care about which minor version to import
// This should keep upgrade diffs isolated to this module
function mapMajorToSpecifiVersion(
	majorVersion: SupportedMajorVersions
): SupportedVersions {
	switch (majorVersion) {
		case "0.17":
			return "0.17.19";
		case "0.18":
			return "0.18.20";
		case "0.19":
			return "0.19.11";
		case "0.20":
			return "0.20.2";
		default:
			assertNever(majorVersion, `esbuild@${majorVersion} is not supported`);
	}
}

// This function will "massage" the imported module to the contract that this module expects
// This is intended to allow for the calling code to not care about the specific version of esbuild
function massageVersionToContract(module: typeof esbuild): typeof esbuild {
	const moduleVersion = module.version as SupportedVersions;
	switch (moduleVersion) {
		case "0.17.19":
			// TODO: massage
			return module;
		case "0.18.20":
			// TODO: massage
			return module;
		case "0.19.11":
			// TODO: massage
			return module;
		case "0.20.2":
			// TODO: massage
			return module;
		default:
			assertNever(moduleVersion, `esbuild@${moduleVersion} is not supported`);
	}
}

// This util is needed while our prettier version does not support the "satisfies" keyword
function assertNever(value: never, errorMessage: string): never {
	throw new Error(errorMessage);
}

const getCacheDirectory = getEnvironmentVariableFactory({
	variableName: "WRANGLER_DYNAMIC_PACKAGE_CACHE_DIR",
	defaultValue() {
		const gobalWranglerConfigDir = getGlobalWranglerConfigPath();

		return path.join(gobalWranglerConfigDir, "dynamic-package-cache");
	},
});

async function dynamicEsbuildImport(
	desiredVersion: SupportedVersions
): Promise<EsbuildAbstraction> {
	try {
		const cachedir = getCacheDirectory();
		const dir = path.join(cachedir, `esbuild-${desiredVersion}`);
		await fs.mkdir(dir, { recursive: true });
		const npm = await getPackageManager(process.cwd());

		logger.debug("Using dynamic package cache location:", dir);

		await fs.writeFile(
			`${dir}/package.json`,
			JSON.stringify({
				type: "module",
				dependencies: { esbuild: desiredVersion },
			})
		);
		await npm.install({ cwd: dir, stdio: "ignore" });

		let specifier = require.resolve(`esbuild`, { paths: [dir] });
		const isWindows = process.platform === "win32";
		if (isWindows) specifier = "file://" + specifier;

		return import(specifier);
	} catch (cause) {
		const error = new Error(
			`Failed to dynamically import esbuild@${desiredVersion}`
		);
		error.cause = cause;

		throw error;
	}
}

let currentImport: Promise<EsbuildAbstraction | void> = Promise.resolve();
export async function dynamicEsbuildImportMaxOnce(
	desiredVersion: SupportedVersions
): Promise<EsbuildAbstraction> {
	const nextImport = currentImport.then<EsbuildAbstraction>(
		async (currentModule) => {
			if (
				currentModule === undefined ||
				currentModule.version !== desiredVersion
			) {
				if (currentModule) {
					// we're changing versions after already changing it,
					logger.warn(
						`Dynamically importing esbuild should only be done once (previous: ${currentModule.version}, next: ${desiredVersion})`
					);
				}

				currentModule = await dynamicEsbuildImport(desiredVersion);
			}

			return currentModule;
		}
	);

	currentImport = nextImport;

	return nextImport;
}
