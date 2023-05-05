import { existsSync, lstatSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { cwd } from "node:process";
import { File, FormData } from "undici";
import { fetchResult } from "../../cfetch";
import { FatalError } from "../../errors";
import { logger } from "../../logger";
import { buildFunctions } from "../../pages/buildFunctions";
import {
	FunctionsNoRoutesError,
	getFunctionsNoRoutesWarning,
} from "../../pages/errors";
import {
	buildRawWorker,
	checkRawWorker,
	traverseAndBuildWorkerJSDirectory,
} from "../../pages/functions/buildWorker";
import { validateRoutes } from "../../pages/functions/routes-validation";
import { upload } from "../../pages/upload";
import { createUploadWorkerBundleContents } from "./create-worker-bundle-contents";
import type { BundleResult } from "../../bundle";
import type { Project, Deployment } from "@cloudflare/types";

interface PagesPublishOptions {
	/**
	 * Path to static assets to publish to Pages
	 */
	directory: string;
	/**
	 * The Cloudflare Account ID that owns the project that's
	 * being published
	 */
	accountId: string;
	/**
	 * The name of the project to be published
	 */
	projectName: string;
	/**
	 * Branch name to use. Defaults to production branch
	 */
	branch?: string;
	/**
	 * Whether or not to skip local file upload result caching
	 */
	skipCaching?: boolean;
	/**
	 * Commit message associated to deployment
	 */
	commitMessage?: string;
	/**
	 * Commit hash associated to deployment
	 */
	commitHash?: string;
	/**
	 * Whether or not the deployment should be considered to be
	 * in a dirty commit state
	 */
	commitDirty?: boolean;
	/**
	 * Path to the project's functions directory. Default uses
	 * the current working directory + /functions since this is
	 * typically called in a CLI
	 */
	functionsDirectory?: string;

	/**
	 * Whether to run bundling on `_worker.js` before deploying.
	 * Default: true
	 */
	bundle?: boolean;

	// TODO: Allow passing in the API key and plumb it through
	// to the API calls so that the publish function does not
	// rely on the `CLOUDFLARE_API_KEY` environment variable
}

/**
 * Publish a directory to an account/project.
 * NOTE: You will need the `CLOUDFLARE_API_KEY` environment
 * variable set
 */
export async function publish({
	directory,
	accountId,
	projectName,
	branch,
	skipCaching,
	commitMessage,
	commitHash,
	commitDirty,
	functionsDirectory: customFunctionsDirectory,
	bundle,
}: PagesPublishOptions) {
	let _headers: string | undefined,
		_redirects: string | undefined,
		_routesGenerated: string | undefined,
		_routesCustom: string | undefined,
		_workerJSIsDirectory = false,
		_workerJS: string | undefined;

	bundle = bundle ?? true;

	const _workerPath = resolvePath(directory, "_worker.js");

	try {
		_headers = readFileSync(join(directory, "_headers"), "utf-8");
	} catch {}

	try {
		_redirects = readFileSync(join(directory, "_redirects"), "utf-8");
	} catch {}

	try {
		/**
		 * Developers can specify a custom _routes.json file, for projects with Pages
		 * Functions or projects in Advanced Mode
		 */
		_routesCustom = readFileSync(join(directory, "_routes.json"), "utf-8");
	} catch {}

	try {
		_workerJSIsDirectory = lstatSync(_workerPath).isDirectory();
		if (!_workerJSIsDirectory) {
			_workerJS = readFileSync(_workerPath, "utf-8");
		}
	} catch {}

	// Grab the bindings from the API, we need these for shims and other such hacky inserts
	const project = await fetchResult<Project>(
		`/accounts/${accountId}/pages/projects/${projectName}`
	);
	let isProduction = true;
	if (branch) {
		isProduction = project.production_branch === branch;
	}

	const deploymentConfig =
		project.deployment_configs[isProduction ? "production" : "preview"];
	const nodejsCompat =
		deploymentConfig.compatibility_flags?.includes("nodejs_compat");

	/**
	 * Evaluate if this is an Advanced Mode or Pages Functions project. If Advanced Mode, we'll
	 * go ahead and upload `_worker.js` as is, but if Pages Functions, we need to attempt to build
	 * Functions first and exit if it failed
	 */
	let builtFunctions: string | undefined = undefined;
	let workerBundle: BundleResult | undefined = undefined;

	const functionsDirectory =
		customFunctionsDirectory || join(cwd(), "functions");
	const routesOutputPath = !existsSync(join(directory, "_routes.json"))
		? join(tmpdir(), `_routes-${Math.random()}.json`)
		: undefined;

	// Routing configuration displayed in the Functions tab of a deployment in Dash
	let filepathRoutingConfig: string | undefined;

	const d1Databases = Object.keys(
		project.deployment_configs[isProduction ? "production" : "preview"]
			.d1_databases ?? {}
	);

	if (!_workerJS && existsSync(functionsDirectory)) {
		const outputConfigPath = join(
			tmpdir(),
			`functions-filepath-routing-config-${Math.random()}.json`
		);

		try {
			workerBundle = await buildFunctions({
				outputConfigPath,
				functionsDirectory,
				onEnd: () => {},
				buildOutputDirectory: directory,
				routesOutputPath,
				local: false,
				d1Databases,
				nodejsCompat,
			});

			builtFunctions = readFileSync(
				workerBundle.resolvedEntryPointPath,
				"utf-8"
			);
			filepathRoutingConfig = readFileSync(outputConfigPath, "utf-8");
		} catch (e) {
			if (e instanceof FunctionsNoRoutesError) {
				logger.warn(
					getFunctionsNoRoutesWarning(functionsDirectory, "skipping")
				);
			} else {
				throw e;
			}
		}
	}

	const manifest = await upload({
		directory,
		accountId,
		projectName,
		skipCaching: skipCaching ?? false,
	});

	const formData = new FormData();

	formData.append("manifest", JSON.stringify(manifest));

	if (branch) {
		formData.append("branch", branch);
	}

	if (commitMessage) {
		formData.append("commit_message", commitMessage);
	}

	if (commitHash) {
		formData.append("commit_hash", commitHash);
	}

	if (commitDirty !== undefined) {
		formData.append("commit_dirty", commitDirty);
	}

	if (_headers) {
		formData.append("_headers", new File([_headers], "_headers"));
		logger.log(`✨ Uploading _headers`);
	}

	if (_redirects) {
		formData.append("_redirects", new File([_redirects], "_redirects"));
		logger.log(`✨ Uploading _redirects`);
	}

	if (filepathRoutingConfig) {
		formData.append(
			"functions-filepath-routing-config.json",
			new File(
				[filepathRoutingConfig],
				"functions-filepath-routing-config.json"
			)
		);
	}

	/**
	 * Advanced Mode
	 * https://developers.cloudflare.com/pages/platform/functions/#advanced-mode
	 *
	 * When using a _worker.js file or _worker.js/ directory, the entire /functions directory is ignored
	 * – this includes its routing and middleware characteristics.
	 */
	if (_workerJSIsDirectory) {
		workerBundle = await traverseAndBuildWorkerJSDirectory({
			workerJSDirectory: _workerPath,
			buildOutputDirectory: directory,
			d1Databases,
			nodejsCompat,
		});
	} else if (_workerJS) {
		if (bundle) {
			const outfile = join(tmpdir(), `./bundledWorker-${Math.random()}.mjs`);
			workerBundle = await buildRawWorker({
				workerScriptPath: _workerPath,
				outfile,
				directory,
				local: false,
				sourcemap: true,
				watch: false,
				onEnd: () => {},
				betaD1Shims: d1Databases,
				nodejsCompat,
			});
		} else {
			await checkRawWorker(_workerPath, () => {});
			// TODO: Let users configure this in the future.
			workerBundle = {
				modules: [],
				dependencies: {},
				stop: undefined,
				resolvedEntryPointPath: _workerPath,
				bundleType: "esm",
			};
		}
	}

	if (_workerJS || _workerJSIsDirectory) {
		const workerBundleContents = await createUploadWorkerBundleContents(
			workerBundle as BundleResult
		);

		formData.append(
			"_worker.bundle",
			new File([workerBundleContents], "_worker.bundle")
		);
		logger.log(`✨ Uploading Worker bundle`);

		if (_routesCustom) {
			// user provided a custom _routes.json file
			try {
				const routesCustomJSON = JSON.parse(_routesCustom);
				validateRoutes(routesCustomJSON, join(directory, "_routes.json"));

				formData.append(
					"_routes.json",
					new File([_routesCustom], "_routes.json")
				);
				logger.log(`✨ Uploading _routes.json`);
			} catch (err) {
				if (err instanceof FatalError) {
					throw err;
				}
			}
		}
	}

	/**
	 * Pages Functions
	 * https://developers.cloudflare.com/pages/platform/functions/
	 */
	if (builtFunctions && !_workerJS && !_workerJSIsDirectory) {
		const workerBundleContents = await createUploadWorkerBundleContents(
			workerBundle as BundleResult
		);

		formData.append(
			"_worker.bundle",
			new File([workerBundleContents], "_worker.bundle")
		);
		logger.log(`✨ Uploading Functions bundle`);

		if (_routesCustom) {
			// user provided a custom _routes.json file
			try {
				const routesCustomJSON = JSON.parse(_routesCustom);
				validateRoutes(routesCustomJSON, join(directory, "_routes.json"));

				formData.append(
					"_routes.json",
					new File([_routesCustom], "_routes.json")
				);
				logger.log(`✨ Uploading _routes.json`);
			} catch (err) {
				if (err instanceof FatalError) {
					throw err;
				}
			}
		} else if (routesOutputPath) {
			// no custom _routes.json file found, so fallback to the generated one
			try {
				_routesGenerated = readFileSync(routesOutputPath, "utf-8");

				if (_routesGenerated) {
					formData.append(
						"_routes.json",
						new File([_routesGenerated], "_routes.json")
					);
				}
			} catch {}
		}
	}

	const deploymentResponse = await fetchResult<Deployment>(
		`/accounts/${accountId}/pages/projects/${projectName}/deployments`,
		{
			method: "POST",
			body: formData,
		}
	);
	return deploymentResponse;
}
