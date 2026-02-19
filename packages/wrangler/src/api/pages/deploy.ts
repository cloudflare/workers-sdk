import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path, { join, resolve as resolvePath } from "node:path";
import { cwd } from "node:process";
import {
	COMPLIANCE_REGION_CONFIG_PUBLIC,
	FatalError,
} from "@cloudflare/workers-utils";
import { FormData } from "undici";
import { fetchResult } from "../../cfetch";
import { readPagesConfig } from "../../config";
import { shouldCheckFetch } from "../../deployment-bundle/bundle";
import { validateNodeCompatMode } from "../../deployment-bundle/node-compat";
import { logger } from "../../logger";
import { isNavigatorDefined } from "../../navigator-user-agent";
import { buildFunctions } from "../../pages/buildFunctions";
import { MAX_DEPLOYMENT_ATTEMPTS } from "../../pages/constants";
import {
	ApiErrorCodes,
	EXIT_CODE_INVALID_PAGES_CONFIG,
	FunctionsNoRoutesError,
	getFunctionsNoRoutesWarning,
} from "../../pages/errors";
import {
	buildRawWorker,
	checkRawWorker,
	produceWorkerBundleForWorkerJSDirectory,
} from "../../pages/functions/buildWorker";
import { validateRoutes } from "../../pages/functions/routes-validation";
import { maxFileCountAllowedFromClaims, upload } from "../../pages/upload";
import { getPagesTmpDir, truncateUtf8Bytes } from "../../pages/utils";
import { validate } from "../../pages/validate";
import { createUploadWorkerBundleContents } from "./create-worker-bundle-contents";
import type { BundleResult } from "../../deployment-bundle/bundle";
import type { Deployment, Project } from "@cloudflare/types";
import type { Config } from "@cloudflare/workers-utils";

const MAX_COMMIT_MESSAGE_BYTES = 384;

interface PagesDeployOptions {
	/**
	 * Path to static assets to deploy to Pages
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
	/**
	 * Whether to upload any server-side sourcemaps with this deployment
	 */
	sourceMaps: boolean;
	/**
	 * Command line args passed to the `pages deploy` cmd
	 */
	args?: Record<string, unknown>;

	// TODO: Allow passing in the API key and plumb it through
	// to the API calls so that the deploy function does not
	// rely on the `CLOUDFLARE_API_KEY` environment variable
}

/**
 * Publish a directory to an account/project.
 * NOTE: You will need the `CLOUDFLARE_API_KEY` environment
 * variable set
 */
export async function deploy({
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
	sourceMaps,
	args,
}: PagesDeployOptions) {
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

	const workerJSStats = lstatSync(_workerPath, { throwIfNoEntry: false });
	_workerJSIsDirectory = workerJSStats?.isDirectory() ?? false;
	if (workerJSStats !== undefined && !_workerJSIsDirectory) {
		_workerJS = readFileSync(_workerPath, "utf-8");
	}

	// Grab the bindings from the API, we need these for shims and other such hacky inserts
	const project = await fetchResult<Project>(
		COMPLIANCE_REGION_CONFIG_PUBLIC,
		`/accounts/${accountId}/pages/projects/${projectName}`
	);
	let isProduction = true;
	if (branch) {
		isProduction = project.production_branch === branch;
	}

	const env = isProduction ? "production" : "preview";
	const deploymentConfig = project.deployment_configs[env];
	let config: Config | undefined;

	try {
		config = readPagesConfig(
			{ ...args, env },
			{ useRedirectIfAvailable: true }
		);
	} catch (err) {
		if (
			!(
				err instanceof FatalError && err.code === EXIT_CODE_INVALID_PAGES_CONFIG
			)
		) {
			throw err;
		}
	}

	const nodejsCompatMode = validateNodeCompatMode(
		config?.compatibility_date ?? deploymentConfig.compatibility_date,
		config?.compatibility_flags ?? deploymentConfig.compatibility_flags ?? [],
		{
			noBundle: config?.no_bundle,
		}
	);
	const defineNavigatorUserAgent = isNavigatorDefined(
		config?.compatibility_date ?? deploymentConfig.compatibility_date,
		config?.compatibility_flags ?? deploymentConfig.compatibility_flags
	);
	const checkFetch = shouldCheckFetch(
		config?.compatibility_date ?? deploymentConfig.compatibility_date,
		config?.compatibility_flags ?? deploymentConfig.compatibility_flags
	);

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
		? join(getPagesTmpDir(), `_routes-${Math.random()}.json`)
		: undefined;

	// Routing configuration displayed in the Functions tab of a deployment in Dash
	let filepathRoutingConfig: string | undefined;

	if (!_workerJS && existsSync(functionsDirectory)) {
		const outputConfigPath = join(
			getPagesTmpDir(),
			`functions-filepath-routing-config-${Math.random()}.json`
		);

		try {
			workerBundle = await buildFunctions({
				outputConfigPath,
				functionsDirectory,
				sourcemap: sourceMaps,
				onEnd: () => {},
				buildOutputDirectory: directory,
				routesOutputPath,
				local: false,
				nodejsCompatMode,
				defineNavigatorUserAgent,
				checkFetch,
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

	// Fetch JWT to get file count limit for validation
	const { jwt } = await fetchResult<{ jwt: string }>(
		COMPLIANCE_REGION_CONFIG_PUBLIC,
		`/accounts/${accountId}/pages/projects/${projectName}/upload-token`
	);

	const fileCountLimit = maxFileCountAllowedFromClaims(jwt);

	const fileMap = await validate({ directory, fileCountLimit });

	const manifest = await upload({
		fileMap,
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
		formData.append(
			"commit_message",
			truncateUtf8Bytes(commitMessage, MAX_COMMIT_MESSAGE_BYTES)
		);
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

	if (
		config !== undefined &&
		config.configPath !== undefined &&
		config.pages_build_output_dir
	) {
		const configHash = createHash("sha256")
			.update(await readFile(config.configPath))
			.digest("hex");
		const outputDir = path.relative(
			process.cwd(),
			config.pages_build_output_dir
		);

		formData.append("wrangler_config_hash", configHash);
		formData.append("pages_build_output_dir", outputDir);
	}

	/**
	 * Advanced Mode
	 * https://developers.cloudflare.com/pages/platform/functions/#advanced-mode
	 *
	 * When using a _worker.js file or _worker.js/ directory, the entire /functions directory is ignored
	 * – this includes its routing and middleware characteristics.
	 */
	if (_workerJSIsDirectory) {
		workerBundle = await produceWorkerBundleForWorkerJSDirectory({
			workerJSDirectory: _workerPath,
			bundle,
			buildOutputDirectory: directory,
			nodejsCompatMode,
			defineNavigatorUserAgent,
			checkFetch,
			sourceMaps: sourceMaps,
		});
	} else if (_workerJS) {
		if (bundle) {
			const outfile = join(
				getPagesTmpDir(),
				`./bundledWorker-${Math.random()}.mjs`
			);
			workerBundle = await buildRawWorker({
				workerScriptPath: _workerPath,
				outfile,
				directory,
				local: false,
				sourcemap: true,
				watch: false,
				onEnd: () => {},
				nodejsCompatMode,
				defineNavigatorUserAgent,
				checkFetch,
			});
		} else {
			await checkRawWorker(_workerPath, nodejsCompatMode, () => {});
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
			workerBundle as BundleResult,
			config
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
			workerBundle as BundleResult,
			config
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

	let attempts = 0;
	let lastErr: unknown;
	while (attempts < MAX_DEPLOYMENT_ATTEMPTS) {
		try {
			const deploymentResponse = await fetchResult<Deployment>(
				COMPLIANCE_REGION_CONFIG_PUBLIC,
				`/accounts/${accountId}/pages/projects/${projectName}/deployments`,
				{
					method: "POST",
					body: formData,
				}
			);
			return { deploymentResponse, formData };
		} catch (e) {
			lastErr = e;
			if (
				(e as { code: number }).code === ApiErrorCodes.UNKNOWN_ERROR &&
				attempts < MAX_DEPLOYMENT_ATTEMPTS
			) {
				logger.debug("failed:", e, "retrying...");
				// Exponential backoff, 1 second first time, then 2 second, then 4 second etc.
				await new Promise((resolvePromise) =>
					setTimeout(resolvePromise, Math.pow(2, attempts++) * 1000)
				);
			} else {
				logger.debug("failed:", e);
				throw e;
			}
		}
	}
	// We should never make it here, but just in case
	throw lastErr;
}
