import assert from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { URLSearchParams } from "node:url";
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
import { addHyphens } from "../deployments";
import { confirm } from "../dialogs";
import { getMigrationsToUpload } from "../durable";
import { logger } from "../logger";
import { getMetricsUsageHeaders } from "../metrics";
import { ParseError } from "../parse";
import { getWranglerTmpDir } from "../paths";
import { getQueue } from "../queues/client";
import {
	getSourceMappedString,
	maybeRetrieveFileSourceMap,
} from "../sourcemap";
import type { FetchError } from "../cfetch";
import type { Config } from "../config";
import type { Rule } from "../config/environment";
import type { Entry } from "../deployment-bundle/entry";
import type { CfWorkerInit, CfPlacement } from "../deployment-bundle/worker";
import type { RetrieveSourceMapFunction } from "../sourcemap";

type Props = {
	config: Config;
	accountId: string | undefined;
	entry: Entry;
	rules: Config["rules"];
	name: string | undefined;
	env: string | undefined;
	compatibilityDate: string | undefined;
	compatibilityFlags: string[] | undefined;
	vars: Record<string, string> | undefined;
	defines: Record<string, string> | undefined;
	jsxFactory: string | undefined;
	jsxFragment: string | undefined;
	tsconfig: string | undefined;
	isWorkersSite: boolean;
	minify: boolean | undefined;
	nodeCompat: boolean | undefined;
	outDir: string | undefined;
	dryRun: boolean | undefined;
	noBundle: boolean | undefined;
	keepVars: boolean | undefined;
	projectRoot: string | undefined;
};

const scriptStartupErrorRegex = /startup/i;

function errIsScriptSize(err: unknown): err is { code: 10027 } {
	if (!err) return false;

	// 10027 = workers.api.error.script_too_large
	if ((err as { code: number }).code === 10027) {
		return true;
	}

	return false;
}

function errIsStartupErr(err: unknown): err is ParseError & { code: 10021 } {
	if (!err) return false;

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

export default async function versionsUpload(props: Props): Promise<void> {
	// TODO: warn if git/hg has uncommitted changes
	const { config, accountId, name } = props;
	if (accountId && name) {
		try {
			const serviceMetaData = await fetchResult(
				`/accounts/${accountId}/workers/services/${name}`
			);
			const { default_environment } = serviceMetaData as {
				default_environment: {
					script: { last_deployed_from: "dash" | "wrangler" | "api" };
				};
			};

			if (default_environment.script.last_deployed_from === "dash") {
				logger.warn(
					`You are about to publish a Workers Service that was last published via the Cloudflare Dashboard.\nEdits that have been made via the dashboard will be overridden by your local code and config.`
				);
				if (!(await confirm("Would you like to continue?"))) {
					return;
				}
			} else if (default_environment.script.last_deployed_from === "api") {
				logger.warn(
					`You are about to publish a Workers Service that was last updated via the script API.\nEdits that have been made via the script API will be overridden by your local code and config.`
				);
				if (!(await confirm("Would you like to continue?"))) {
					return;
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

		throw new Error(`A compatibility_date is required when publishing. Add the following to your wrangler.toml file:.
    \`\`\`
    compatibility_date = "${compatibilityDateStr}"
    \`\`\`
    Or you could pass it in your terminal as \`--compatibility-date ${compatibilityDateStr}\`
See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information.`);
	}

	const jsxFactory = props.jsxFactory || config.jsx_factory;
	const jsxFragment = props.jsxFragment || config.jsx_fragment;
	const keepVars = props.keepVars || config.keep_vars;

	const minify = props.minify ?? config.minify;

	const legacyNodeCompat = props.nodeCompat ?? config.node_compat;
	if (legacyNodeCompat) {
		logger.warn(
			"Enabling Node.js compatibility mode for built-ins and globals. This is experimental and has serious tradeoffs. Please see https://github.com/ionic-team/rollup-plugin-node-polyfills/ for more details."
		);
	}

	const compatibilityFlags =
		props.compatibilityFlags ?? config.compatibility_flags;
	const nodejsCompat = compatibilityFlags.includes("nodejs_compat");
	assert(
		!(legacyNodeCompat && nodejsCompat),
		"The `nodejs_compat` compatibility flag cannot be used in conjunction with the legacy `--node-compat` flag. If you want to use the Workers runtime Node.js compatibility features, please remove the `--node-compat` argument from your CLI command or `node_compat = true` from your config file."
	);

	// Warn if user tries minify or node-compat with no-bundle
	if (props.noBundle && minify) {
		logger.warn(
			"`--minify` and `--no-bundle` can't be used together. If you want to minify your Worker and disable Wrangler's bundling, please minify as part of your own bundling process."
		);
	}

	if (props.noBundle && legacyNodeCompat) {
		logger.warn(
			"`--node-compat` and `--no-bundle` can't be used together. If you want to polyfill Node.js built-ins and disable Wrangler's bundling, please polyfill as part of your own bundling process."
		);
	}

	const scriptName = props.name;
	assert(
		scriptName,
		'You need to provide a name when publishing a worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`'
	);

	assert(
		!config.site || config.site.bucket,
		"A [site] definition requires a `bucket` field with a path to the site's assets directory."
	);

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
	const envName = props.env ?? "production";

	const start = Date.now();
	const workerName = scriptName;
	const workerUrl = `/accounts/${accountId}/workers/scripts/${scriptName}`;

	let available_on_subdomain: boolean | undefined = undefined; // we'll set this later
	let deploymentId: string | null = null;

	const { format } = props.entry;

	if (config.wasm_modules && format === "modules") {
		throw new Error(
			"You cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code"
		);
	}

	if (config.text_blobs && format === "modules") {
		throw new Error(
			"You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure `[rules]` in your wrangler.toml"
		);
	}

	if (config.data_blobs && format === "modules") {
		throw new Error(
			"You cannot configure [data_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure `[rules]` in your wrangler.toml"
		);
	}
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

		const { modules, dependencies, resolvedEntryPointPath, bundleType } =
			props.noBundle
				? await noBundleWorker(props.entry, props.rules, props.outDir)
				: await bundleWorker(
						props.entry,
						typeof destination === "string" ? destination : destination.path,
						{
							bundle: true,
							additionalModules: [],
							moduleCollector,
							serveAssetsFromWorker: false,
							doBindings: config.durable_objects.bindings,
							jsxFactory,
							jsxFragment,
							tsconfig: props.tsconfig ?? config.tsconfig,
							minify,
							legacyNodeCompat,
							nodejsCompat,
							define: { ...config.define, ...props.defines },
							checkFetch: false,
							assets: config.assets,
							// enable the cache when publishing
							bypassAssetCache: false,
							services: config.services,
							// We don't set workerDefinitions here,
							// because we don't want to apply the dev-time
							// facades on top of it
							workerDefinitions: undefined,
							// We want to know if the build is for development or publishing
							// This could potentially cause issues as we no longer have identical behaviour between dev and deploy?
							targetConsumer: "deploy",
							local: false,
							projectRoot: props.projectRoot,
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
					legacyEnv: false,
					env: props.env,
			  })
			: undefined;

		const bindings: CfWorkerInit["bindings"] = {
			kv_namespaces: config.kv_namespaces || [],
			send_email: config.send_email,
			vars: { ...config.vars, ...props.vars },
			wasm_modules: config.wasm_modules,
			browser: config.browser,
			ai: config.ai,
			text_blobs: config.text_blobs,
			data_blobs: config.data_blobs,
			durable_objects: config.durable_objects,
			queues: config.queues.producers?.map((producer) => {
				return { binding: producer.binding, queue_name: producer.queue };
			}),
			r2_buckets: config.r2_buckets,
			d1_databases: config.d1_databases,
			vectorize: config.vectorize,
			constellation: config.constellation,
			hyperdrive: config.hyperdrive,
			services: config.services,
			analytics_engine_datasets: config.analytics_engine_datasets,
			dispatch_namespaces: config.dispatch_namespaces,
			mtls_certificates: config.mtls_certificates,
			logfwdr: config.logfwdr,
			unsafe: {
				bindings: config.unsafe.bindings,
				metadata: config.unsafe.metadata,
				capnp: config.unsafe.capnp,
			},
		};

		// The upload API only accepts an empty string or no specified placement for the "off" mode.
		const placement: CfPlacement | undefined =
			config.placement?.mode === "smart" ? { mode: "smart" } : undefined;

		const entryPointName = path.basename(resolvedEntryPointPath);
		const worker: CfWorkerInit = {
			name: scriptName,
			main: {
				name: entryPointName,
				filePath: resolvedEntryPointPath,
				content: content,
				type: bundleType,
			},
			bindings,
			migrations,
			modules,
			compatibility_date: props.compatibilityDate ?? config.compatibility_date,
			compatibility_flags: compatibilityFlags,
			usage_model: config.usage_model,
			keepVars,
			logpush: undefined,
			placement,
			tail_consumers: config.tail_consumers,
			limits: config.limits,
		};

		// As this is not deterministic for testing, we detect if in a jest environment and run asynchronously
		// We do not care about the timing outside of testing
		const bundleSizePromise = printBundleSize(
			{ name: path.basename(resolvedEntryPointPath), content: content },
			modules
		);
		if (process.env.JEST_WORKER_ID !== undefined) await bundleSizePromise;
		else void bundleSizePromise;

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

		printBindings({ ...withoutStaticAssets, vars: maskedVars });

		if (!props.dryRun) {
			await ensureQueuesExist(config);

			// Upload the script so it has time to propagate.
			// We can also now tell whether available_on_subdomain is set
			try {
				const result = await fetchResult<{
					available_on_subdomain: boolean;
					id: string | null;
					etag: string | null;
					pipeline_hash: string | null;
					mutable_pipeline_id: string | null;
					deployment_id: string | null;
				}>(
					workerUrl,
					{
						method: "PUT",
						body: createWorkerUploadForm(worker),
						headers: await getMetricsUsageHeaders(config.send_metrics),
					},
					new URLSearchParams({
						include_subdomain_availability: "true",
						// pass excludeScript so the whole body of the
						// script doesn't get included in the response
						excludeScript: "true",
					})
				);

				available_on_subdomain = result.available_on_subdomain;
				deploymentId = addHyphens(result.deployment_id) ?? result.deployment_id;

				if (config.first_party_worker) {
					// Print some useful information returned after publishing
					// Not all fields will be populated for every worker
					// These fields are likely to be scraped by tools, so do not rename
					if (result.id) logger.log("Worker ID: ", result.id);
					if (result.etag) logger.log("Worker ETag: ", result.etag);
					if (result.pipeline_hash)
						logger.log("Worker PipelineHash: ", result.pipeline_hash);
					if (result.mutable_pipeline_id)
						logger.log(
							"Worker Mutable PipelineID (Development ONLY!):",
							result.mutable_pipeline_id
						);
				}
			} catch (err) {
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
						if (bundleType === "commonjs") return resolvedEntryPointPath;
						// Similarly, if the name matches the entrypoint, return its path
						if (moduleName === entryPointName) return resolvedEntryPointPath;
						// Otherwise, return the file path of the matching module (if any)
						for (const module of modules) {
							if (moduleName === module.name) return module.filePath;
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
		return;
	}
	assert(accountId, "Missing accountId");

	const uploadMs = Date.now() - start;
	const deployments: Promise<string[]>[] = [];

	logger.log("Uploaded", workerName, formatTime(uploadMs));
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

async function ensureQueuesExist(config: Config) {
	const producers = (config.queues.producers || []).map(
		(producer) => producer.queue
	);
	const consumers = (config.queues.consumers || []).map(
		(consumer) => consumer.queue
	);

	const queueNames = producers.concat(consumers);
	for (const queue of queueNames) {
		try {
			await getQueue(config, queue);
		} catch (err) {
			const queueErr = err as FetchError;
			if (queueErr.code === 11000) {
				// queue_not_found
				throw new Error(
					`Queue "${queue}" does not exist. To create it, run: wrangler queues create ${queue}`
				);
			}
			throw err;
		}
	}
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
