import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { blue, gray } from "@cloudflare/cli/colors";
import { syncAssets } from "../assets";
import { fetchResult } from "../cfetch";
import { printBindings } from "../config";
import { bundleWorker } from "../deployment-bundle/bundle";
import {
	printBundleSize,
	printOffendingDependencies,
} from "../deployment-bundle/bundle-reporter";
import { getBundleType } from "../deployment-bundle/bundle-type";
import { createWorkerUploadForm } from "../deployment-bundle/create-worker-upload-form";
import {
	findAdditionalModules,
	writeAdditionalModules,
} from "../deployment-bundle/find-additional-modules";
import {
	createModuleCollector,
	getWrangler1xLegacyModuleReferences,
} from "../deployment-bundle/module-collection";
import { validateNodeCompatMode } from "../deployment-bundle/node-compat";
import { loadSourceMaps } from "../deployment-bundle/source-maps";
import { confirm } from "../dialogs";
import { getMigrationsToUpload } from "../durable";
import { UserError } from "../errors";
import { logger } from "../logger";
import { getMetricsUsageHeaders } from "../metrics";
import { isNavigatorDefined } from "../navigator-user-agent";
import { ParseError } from "../parse";
import { getWranglerTmpDir } from "../paths";
import { ensureQueuesExistByConfig } from "../queues/client";
import { getWorkersDevSubdomain } from "../routes";
import {
	getSourceMappedString,
	maybeRetrieveFileSourceMap,
} from "../sourcemap";
import { retryOnError } from "../utils/retry";
import type { AssetsOptions } from "../assets";
import type { Config } from "../config";
import type { Rule } from "../config/environment";
import type { Entry } from "../deployment-bundle/entry";
import type { CfPlacement, CfWorkerInit } from "../deployment-bundle/worker";
import type { RetrieveSourceMapFunction } from "../sourcemap";

type Props = {
	config: Config;
	accountId: string | undefined;
	entry: Entry;
	rules: Config["rules"];
	name: string;
	legacyEnv: boolean | undefined;
	env: string | undefined;
	compatibilityDate: string | undefined;
	compatibilityFlags: string[] | undefined;
	assetsOptions: AssetsOptions | undefined;
	vars: Record<string, string> | undefined;
	defines: Record<string, string> | undefined;
	alias: Record<string, string> | undefined;
	jsxFactory: string | undefined;
	jsxFragment: string | undefined;
	tsconfig: string | undefined;
	isWorkersSite: boolean;
	minify: boolean | undefined;
	uploadSourceMaps: boolean | undefined;
	nodeCompat: boolean | undefined;
	outDir: string | undefined;
	dryRun: boolean | undefined;
	noBundle: boolean | undefined;
	keepVars: boolean | undefined;
	projectRoot: string | undefined;

	tag: string | undefined;
	message: string | undefined;
};

const scriptStartupErrorRegex = /startup/i;

function errIsScriptSize(err: unknown): err is { code: 10027 } {
	if (!err) {
		return false;
	}

	// 10027 = workers.api.error.script_too_large
	if ((err as { code: number }).code === 10027) {
		return true;
	}

	return false;
}

function errIsStartupErr(err: unknown): err is ParseError & { code: 10021 } {
	if (!err) {
		return false;
	}

	// 10021 = validation error
	// no explicit error code for more granular errors than "invalid script"
	// but the error will contain a string error message directly from the
	// validator.
	// the error always SHOULD look like "Script startup exceeded CPU limit."
	// (or the less likely "Script startup exceeded memory limits.")
	if (
		(err as { code: number }).code === 10021 &&
		err instanceof ParseError &&
		scriptStartupErrorRegex.test(err.notes[0]?.text)
	) {
		return true;
	}

	return false;
}

export default async function versionsUpload(
	props: Props
): Promise<{ versionId: string | null; workerTag: string | null }> {
	// TODO: warn if git/hg has uncommitted changes
	const { config, accountId, name } = props;
	let versionId: string | null = null;
	let workerTag: string | null = null;

	if (accountId && name) {
		try {
			const {
				default_environment: { script },
			} = await fetchResult<{
				default_environment: {
					script: {
						tag: string;
						last_deployed_from: "dash" | "wrangler" | "api";
					};
				};
			}>(
				`/accounts/${accountId}/workers/services/${name}` // TODO(consider): should this be a /versions endpoint?
			);

			workerTag = script.tag;

			if (script.last_deployed_from === "dash") {
				logger.warn(
					`You are about to upload a Worker Version that was last published via the Cloudflare Dashboard.\nEdits that have been made via the dashboard will be overridden by your local code and config.`
				);
				if (!(await confirm("Would you like to continue?"))) {
					return {
						versionId,
						workerTag,
					};
				}
			} else if (script.last_deployed_from === "api") {
				logger.warn(
					`You are about to upload a Workers Version that was last updated via the API.\nEdits that have been made via the API will be overridden by your local code and config.`
				);
				if (!(await confirm("Would you like to continue?"))) {
					return {
						versionId,
						workerTag,
					};
				}
			}
		} catch (e) {
			// code: 10090, message: workers.api.error.service_not_found
			// is thrown from the above fetchResult on the first deploy of a Worker
			if ((e as { code?: number }).code !== 10090) {
				throw e;
			}
		}
	}

	if (!(props.compatibilityDate || config.compatibility_date)) {
		const compatibilityDateStr = `${new Date().getFullYear()}-${(
			new Date().getMonth() +
			1 +
			""
		).padStart(2, "0")}-${(new Date().getDate() + "").padStart(2, "0")}`;

		throw new UserError(`A compatibility_date is required when uploading a Worker Version. Add the following to your wrangler.toml file:.
    \`\`\`
    compatibility_date = "${compatibilityDateStr}"
    \`\`\`
    Or you could pass it in your terminal as \`--compatibility-date ${compatibilityDateStr}\`
See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information.`);
	}

	const jsxFactory = props.jsxFactory || config.jsx_factory;
	const jsxFragment = props.jsxFragment || config.jsx_fragment;

	const minify = props.minify ?? config.minify;

	const nodejsCompatMode = validateNodeCompatMode(
		props.compatibilityDate ?? config.compatibility_date,
		props.compatibilityFlags ?? config.compatibility_flags,
		{
			nodeCompat: props.nodeCompat ?? config.node_compat,
			noBundle: props.noBundle ?? config.no_bundle,
		}
	);

	const compatibilityFlags =
		props.compatibilityFlags ?? config.compatibility_flags;

	// Warn if user tries minify or node-compat with no-bundle
	if (props.noBundle && minify) {
		logger.warn(
			"`--minify` and `--no-bundle` can't be used together. If you want to minify your Worker and disable Wrangler's bundling, please minify as part of your own bundling process."
		);
	}

	const scriptName = props.name;

	if (config.site && !config.site.bucket) {
		throw new UserError(
			"A [site] definition requires a `bucket` field with a path to the site's assets directory."
		);
	}

	if (props.outDir) {
		// we're using a custom output directory,
		// so let's first ensure it exists
		mkdirSync(props.outDir, { recursive: true });
		// add a README
		const readmePath = path.join(props.outDir, "README.md");
		writeFileSync(
			readmePath,
			`This folder contains the built output assets for the worker "${scriptName}" generated at ${new Date().toISOString()}.`
		);
	}

	const destination =
		props.outDir ?? getWranglerTmpDir(props.projectRoot, "deploy");

	const start = Date.now();
	const workerName = scriptName;
	const workerUrl = `/accounts/${accountId}/workers/scripts/${scriptName}`;

	const { format } = props.entry;

	if (config.wasm_modules && format === "modules") {
		throw new UserError(
			"You cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code"
		);
	}

	if (config.text_blobs && format === "modules") {
		throw new UserError(
			"You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure `[rules]` in your wrangler.toml"
		);
	}

	if (config.data_blobs && format === "modules") {
		throw new UserError(
			"You cannot configure [data_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure `[rules]` in your wrangler.toml"
		);
	}

	let hasPreview = false;

	try {
		if (props.noBundle) {
			// if we're not building, let's just copy the entry to the destination directory
			const destinationDir =
				typeof destination === "string" ? destination : destination.path;
			mkdirSync(destinationDir, { recursive: true });
			writeFileSync(
				path.join(destinationDir, path.basename(props.entry.file)),
				readFileSync(props.entry.file, "utf-8")
			);
		}

		const entryDirectory = path.dirname(props.entry.file);
		const moduleCollector = createModuleCollector({
			wrangler1xLegacyModuleReferences: getWrangler1xLegacyModuleReferences(
				entryDirectory,
				props.entry.file
			),
			entry: props.entry,
			// `moduleCollector` doesn't get used when `props.noBundle` is set, so
			// `findAdditionalModules` always defaults to `false`
			findAdditionalModules: config.find_additional_modules ?? false,
			rules: props.rules,
		});
		const uploadSourceMaps =
			props.uploadSourceMaps ?? config.upload_source_maps;

		const {
			modules,
			dependencies,
			resolvedEntryPointPath,
			bundleType,
			...bundle
		} = props.noBundle
			? await noBundleWorker(props.entry, props.rules, props.outDir)
			: await bundleWorker(
					props.entry,
					typeof destination === "string" ? destination : destination.path,
					{
						bundle: true,
						additionalModules: [],
						moduleCollector,
						serveLegacyAssetsFromWorker: false,
						doBindings: config.durable_objects.bindings,
						jsxFactory,
						jsxFragment,
						tsconfig: props.tsconfig ?? config.tsconfig,
						minify,
						sourcemap: uploadSourceMaps,
						nodejsCompatMode,
						define: { ...config.define, ...props.defines },
						alias: { ...config.alias, ...props.alias },
						checkFetch: false,
						legacyAssets: config.legacy_assets,
						mockAnalyticsEngineDatasets: [],
						// enable the cache when publishing
						bypassAssetCache: false,
						// We want to know if the build is for development or publishing
						// This could potentially cause issues as we no longer have identical behaviour between dev and deploy?
						targetConsumer: "deploy",
						local: false,
						projectRoot: props.projectRoot,
						defineNavigatorUserAgent: isNavigatorDefined(
							props.compatibilityDate ?? config.compatibility_date,
							props.compatibilityFlags ?? config.compatibility_flags
						),
					}
				);

		// Add modules to dependencies for size warning
		for (const module of modules) {
			const modulePath =
				module.filePath === undefined
					? module.name
					: path.relative("", module.filePath);
			const bytesInOutput =
				typeof module.content === "string"
					? Buffer.byteLength(module.content)
					: module.content.byteLength;
			dependencies[modulePath] = { bytesInOutput };
		}

		const content = readFileSync(resolvedEntryPointPath, {
			encoding: "utf-8",
		});

		// durable object migrations
		const migrations = !props.dryRun
			? await getMigrationsToUpload(scriptName, {
					accountId,
					config,
					legacyEnv: props.legacyEnv,
					env: props.env,
				})
			: undefined;

		// Upload assets if assets is being used
		const assetsJwt =
			props.assetsOptions && !props.dryRun
				? await syncAssets(accountId, scriptName, props.assetsOptions.directory)
				: undefined;

		const bindings: CfWorkerInit["bindings"] = {
			kv_namespaces: config.kv_namespaces || [],
			send_email: config.send_email,
			vars: { ...config.vars, ...props.vars },
			wasm_modules: config.wasm_modules,
			browser: config.browser,
			ai: config.ai,
			version_metadata: config.version_metadata,
			text_blobs: config.text_blobs,
			data_blobs: config.data_blobs,
			durable_objects: config.durable_objects,
			queues: config.queues.producers?.map((producer) => {
				return { binding: producer.binding, queue_name: producer.queue };
			}),
			r2_buckets: config.r2_buckets,
			d1_databases: config.d1_databases,
			vectorize: config.vectorize,
			hyperdrive: config.hyperdrive,
			services: config.services,
			analytics_engine_datasets: config.analytics_engine_datasets,
			dispatch_namespaces: config.dispatch_namespaces,
			mtls_certificates: config.mtls_certificates,
			pipelines: config.pipelines,
			logfwdr: config.logfwdr,
			assets: config.assets?.binding
				? { binding: config.assets?.binding }
				: undefined,
			unsafe: {
				bindings: config.unsafe.bindings,
				metadata: config.unsafe.metadata,
				capnp: config.unsafe.capnp,
			},
		};

		// The upload API only accepts an empty string or no specified placement for the "off" mode.
		const placement: CfPlacement | undefined =
			config.placement?.mode === "smart"
				? { mode: "smart", hint: config.placement.hint }
				: undefined;

		const entryPointName = path.basename(resolvedEntryPointPath);
		const main = {
			name: entryPointName,
			filePath: resolvedEntryPointPath,
			content: content,
			type: bundleType,
		};
		const worker: CfWorkerInit = {
			name: scriptName,
			main,
			bindings,
			migrations,
			modules,
			sourceMaps: uploadSourceMaps
				? loadSourceMaps(main, modules, bundle)
				: undefined,
			compatibility_date: props.compatibilityDate ?? config.compatibility_date,
			compatibility_flags: compatibilityFlags,
			keepVars: false, // the wrangler.toml should be the source-of-truth for vars
			keepSecrets: true, // until wrangler.toml specifies secret bindings, we need to inherit from the previous Worker Version
			placement,
			tail_consumers: config.tail_consumers,
			limits: config.limits,
			annotations: {
				"workers/message": props.message,
				"workers/tag": props.tag,
			},
			assets:
				props.assetsOptions && assetsJwt
					? {
							jwt: assetsJwt,
							routingConfig: props.assetsOptions.routingConfig,
							assetConfig: props.assetsOptions.assetConfig,
						}
					: undefined,
			logpush: undefined, // both logpush and observability are not supported in versions upload
			observability: undefined,
		};

		await printBundleSize(
			{ name: path.basename(resolvedEntryPointPath), content: content },
			modules
		);

		const withoutStaticAssets = {
			...bindings,
			kv_namespaces: config.kv_namespaces,
			text_blobs: config.text_blobs,
		};

		// mask anything that was overridden in cli args
		// so that we don't log potential secrets into the terminal
		const maskedVars = { ...withoutStaticAssets.vars };
		for (const key of Object.keys(maskedVars)) {
			if (maskedVars[key] !== config.vars[key]) {
				// This means it was overridden in cli args
				// so let's mask it
				maskedVars[key] = "(hidden)";
			}
		}

		if (props.dryRun) {
			printBindings({ ...withoutStaticAssets, vars: maskedVars });
		} else {
			await ensureQueuesExistByConfig(config);
			let bindingsPrinted = false;

			// Upload the version.
			try {
				const body = createWorkerUploadForm(worker);

				const result = await retryOnError(async () =>
					fetchResult<{
						id: string;
						startup_time_ms: number;
						metadata: {
							has_preview: boolean;
						};
					}>(`${workerUrl}/versions`, {
						method: "POST",
						body,
						headers: await getMetricsUsageHeaders(config.send_metrics),
					})
				);

				logger.log("Worker Startup Time:", result.startup_time_ms, "ms");
				bindingsPrinted = true;
				printBindings({ ...withoutStaticAssets, vars: maskedVars });
				versionId = result.id;
				hasPreview = result.metadata.has_preview;
			} catch (err) {
				if (!bindingsPrinted) {
					printBindings({ ...withoutStaticAssets, vars: maskedVars });
				}

				helpIfErrorIsSizeOrScriptStartup(err, dependencies);

				// Apply source mapping to validation startup errors if possible
				if (
					err instanceof ParseError &&
					"code" in err &&
					err.code === 10021 /* validation error */ &&
					err.notes.length > 0
				) {
					const maybeNameToFilePath = (moduleName: string) => {
						// If this is a service worker, always return the entrypoint path.
						// Service workers can't have additional JavaScript modules.
						if (bundleType === "commonjs") {
							return resolvedEntryPointPath;
						}
						// Similarly, if the name matches the entrypoint, return its path
						if (moduleName === entryPointName) {
							return resolvedEntryPointPath;
						}
						// Otherwise, return the file path of the matching module (if any)
						for (const module of modules) {
							if (moduleName === module.name) {
								return module.filePath;
							}
						}
					};
					const retrieveSourceMap: RetrieveSourceMapFunction = (moduleName) =>
						maybeRetrieveFileSourceMap(maybeNameToFilePath(moduleName));

					err.notes[0].text = getSourceMappedString(
						err.notes[0].text,
						retrieveSourceMap
					);
				}

				throw err;
			}
		}
	} finally {
		if (typeof destination !== "string") {
			// this means we're using a temp dir,
			// so let's clean up before we proceed
			destination.remove();
		}
	}

	if (props.dryRun) {
		logger.log(`--dry-run: exiting now.`);
		return { versionId, workerTag };
	}
	if (!accountId) {
		throw new UserError("Missing accountId");
	}

	const uploadMs = Date.now() - start;

	logger.log("Uploaded", workerName, formatTime(uploadMs));
	logger.log("Worker Version ID:", versionId);

	if (versionId && hasPreview) {
		const { enabled: available_on_subdomain } = await fetchResult<{
			enabled: boolean;
		}>(`${workerUrl}/subdomain`);

		if (available_on_subdomain) {
			const userSubdomain = await getWorkersDevSubdomain(accountId);
			const shortVersion = versionId.slice(0, 8);
			logger.log(
				`Version Preview URL: https://${shortVersion}-${workerName}.${userSubdomain}.workers.dev`
			);
		}
	}

	const cmdVersionsDeploy = blue("wrangler versions deploy");
	const cmdTriggersDeploy = blue("wrangler triggers deploy");
	logger.info(
		gray(`
To deploy this version to production traffic use the command ${cmdVersionsDeploy}

Changes to non-versioned settings (config properties 'logpush' or 'tail_consumers') take effect after your next deployment using the command ${cmdVersionsDeploy}

Changes to triggers (routes, custom domains, cron schedules, etc) must be applied with the command ${cmdTriggersDeploy}
`)
	);

	return { versionId, workerTag };
}

export function helpIfErrorIsSizeOrScriptStartup(
	err: unknown,
	dependencies: { [path: string]: { bytesInOutput: number } }
) {
	if (errIsScriptSize(err)) {
		printOffendingDependencies(dependencies);
	} else if (errIsStartupErr(err)) {
		const youFailed =
			"Your Worker failed validation because it exceeded startup limits.";
		const heresWhy =
			"To ensure fast responses, we place constraints on Worker startup -- like how much CPU it can use, or how long it can take.";
		const heresTheProblem =
			"Your Worker failed validation, which means it hit one of these startup limits.";
		const heresTheSolution =
			"Try reducing the amount of work done during startup (outside the event handler), either by removing code or relocating it inside the event handler.";
		logger.warn(
			[youFailed, heresWhy, heresTheProblem, heresTheSolution].join("\n")
		);
	}
}

function formatTime(duration: number) {
	return `(${(duration / 1000).toFixed(2)} sec)`;
}

export function isAuthenticationError(e: unknown): e is ParseError {
	return e instanceof ParseError && (e as { code?: number }).code === 10000;
}

async function noBundleWorker(
	entry: Entry,
	rules: Rule[],
	outDir: string | undefined
) {
	const modules = await findAdditionalModules(entry, rules);
	if (outDir) {
		await writeAdditionalModules(modules, outDir);
	}

	return {
		modules,
		dependencies: {} as { [path: string]: { bytesInOutput: number } },
		resolvedEntryPointPath: entry.file,
		bundleType: getBundleType(entry.format),
	};
}
