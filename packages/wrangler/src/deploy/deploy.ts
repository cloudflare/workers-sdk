import assert from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { URLSearchParams } from "node:url";
import { cancel } from "@cloudflare/cli";
import { fetchListResult, fetchResult } from "../cfetch";
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
import { validateNodeCompat } from "../deployment-bundle/node-compat";
import { loadSourceMaps } from "../deployment-bundle/source-maps";
import { addHyphens } from "../deployments";
import { confirm } from "../dialogs";
import { getMigrationsToUpload } from "../durable";
import { UserError } from "../errors";
import { logger } from "../logger";
import { getMetricsUsageHeaders } from "../metrics";
import { isNavigatorDefined } from "../navigator-user-agent";
import { APIError, ParseError } from "../parse";
import { getWranglerTmpDir } from "../paths";
import {
	ensureQueuesExistByConfig,
	getQueue,
	postConsumer,
	putConsumer,
	putConsumerById,
	putQueue,
} from "../queues/client";
import { syncAssets } from "../sites";
import {
	getSourceMappedString,
	maybeRetrieveFileSourceMap,
} from "../sourcemap";
import triggersDeploy from "../triggers/deploy";
import { logVersionIdChange } from "../utils/deployment-id-version-id-change";
import { confirmLatestDeploymentOverwrite } from "../versions/deploy";
import { getZoneForRoute } from "../zones";
import type { Config } from "../config";
import type {
	CustomDomainRoute,
	Route,
	Rule,
	ZoneIdRoute,
	ZoneNameRoute,
} from "../config/environment";
import type { Entry } from "../deployment-bundle/entry";
import type {
	CfModule,
	CfPlacement,
	CfWorkerInit,
} from "../deployment-bundle/worker";
import type { PostQueueBody, PostTypedConsumerBody } from "../queues/client";
import type { AssetPaths } from "../sites";
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
	assetPaths: AssetPaths | undefined;
	experimentalAssets: string | undefined;
	vars: Record<string, string> | undefined;
	defines: Record<string, string> | undefined;
	alias: Record<string, string> | undefined;
	triggers: string[] | undefined;
	routes: string[] | undefined;
	legacyEnv: boolean | undefined;
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
	logpush: boolean | undefined;
	uploadSourceMaps: boolean | undefined;
	oldAssetTtl: number | undefined;
	projectRoot: string | undefined;
	dispatchNamespace: string | undefined;
	experimentalVersions: boolean | undefined;
};

export type RouteObject = ZoneIdRoute | ZoneNameRoute | CustomDomainRoute;

export type CustomDomain = {
	id: string;
	zone_id: string;
	zone_name: string;
	hostname: string;
	service: string;
	environment: string;
};
type UpdatedCustomDomain = CustomDomain & { modified: boolean };
type ConflictingCustomDomain = CustomDomain & {
	external_dns_record_id?: string;
	external_cert_id?: string;
};

export type CustomDomainChangeset = {
	added: CustomDomain[];
	removed: CustomDomain[];
	updated: UpdatedCustomDomain[];
	conflicting: ConflictingCustomDomain[];
};

export function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

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

export function renderRoute(route: Route): string {
	let result = "";
	if (typeof route === "string") {
		result = route;
	} else {
		result = route.pattern;
		const isCustomDomain = Boolean(
			"custom_domain" in route && route.custom_domain
		);
		if (isCustomDomain && "zone_id" in route) {
			result += ` (custom domain - zone id: ${route.zone_id})`;
		} else if (isCustomDomain && "zone_name" in route) {
			result += ` (custom domain - zone name: ${route.zone_name})`;
		} else if (isCustomDomain) {
			result += ` (custom domain)`;
		} else if ("zone_id" in route) {
			result += ` (zone id: ${route.zone_id})`;
		} else if ("zone_name" in route) {
			result += ` (zone name: ${route.zone_name})`;
		}
	}
	return result;
}

// publishing to custom domains involves a few more steps than just updating
// the routing table, and thus the api implementing it is fairly defensive -
// it will error eagerly on conflicts against existing domains or existing
// managed DNS records

// however, you can pass params to override the errors. to know if we should
// override the current state, we generate a "changeset" of required actions
// to get to the state we want (specified by the list of custom domains). the
// changeset returns an "updated" collection (existing custom domains
// connected to other scripts) and a "conflicting" collection (the requested
// custom domains that have a managed, conflicting DNS record preventing the
// host's use as a custom domain). with this information, we can prompt to
// the user what will occur if we create the custom domains requested, and
// add the override param if they confirm the action
//
// if a user does not confirm that they want to override, we skip publishing
// to these custom domains, but continue on through the rest of the
// deploy stage
export async function publishCustomDomains(
	workerUrl: string,
	accountId: string,
	domains: Array<RouteObject>
): Promise<string[]> {
	const config = {
		override_scope: true,
		override_existing_origin: false,
		override_existing_dns_record: false,
	};
	const origins = domains.map((domainRoute) => {
		return {
			hostname: domainRoute.pattern,
			zone_id: "zone_id" in domainRoute ? domainRoute.zone_id : undefined,
			zone_name: "zone_name" in domainRoute ? domainRoute.zone_name : undefined,
		};
	});

	const fail = () => {
		return [
			domains.length > 1
				? `Publishing to ${domains.length} Custom Domains was skipped, fix conflicts and try again`
				: `Publishing to Custom Domain "${domains[0].pattern}" was skipped, fix conflict and try again`,
		];
	};

	if (!process.stdout.isTTY) {
		// running in non-interactive mode.
		// existing origins / dns records are not indicative of errors,
		// so we aggressively update rather than aggressively fail
		config.override_existing_origin = true;
		config.override_existing_dns_record = true;
	} else {
		// get a changeset for operations required to achieve a state with the requested domains
		const changeset = await fetchResult<CustomDomainChangeset>(
			`${workerUrl}/domains/changeset?replace_state=true`,
			{
				method: "POST",
				body: JSON.stringify(origins),
				headers: {
					"Content-Type": "application/json",
				},
			}
		);

		const updatesRequired = changeset.updated.filter(
			(domain) => domain.modified
		);
		if (updatesRequired.length > 0) {
			// find out which scripts the conflict domains are already attached to
			// so we can provide that in the confirmation prompt
			const existing = await Promise.all(
				updatesRequired.map((domain) =>
					fetchResult<CustomDomain>(
						`/accounts/${accountId}/workers/domains/records/${domain.id}`
					)
				)
			);
			const existingRendered = existing
				.map(
					(domain) =>
						`\t• ${domain.hostname} (used as a domain for "${domain.service}")`
				)
				.join("\n");
			const message = `Custom Domains already exist for these domains:
${existingRendered}
Update them to point to this script instead?`;
			if (!(await confirm(message))) {
				return fail();
			}
			config.override_existing_origin = true;
		}

		if (changeset.conflicting.length > 0) {
			const conflicitingRendered = changeset.conflicting
				.map((domain) => `\t• ${domain.hostname}`)
				.join("\n");
			const message = `You already have DNS records that conflict for these Custom Domains:
${conflicitingRendered}
Update them to point to this script instead?`;
			if (!(await confirm(message))) {
				return fail();
			}
			config.override_existing_dns_record = true;
		}
	}

	// deploy to domains
	await fetchResult(`${workerUrl}/domains/records`, {
		method: "PUT",
		body: JSON.stringify({ ...config, origins }),
		headers: {
			"Content-Type": "application/json",
		},
	});

	return domains.map((domain) => renderRoute(domain));
}

export default async function deploy(
	props: Props
): Promise<{ sourceMapSize?: number }> {
	// TODO: warn if git/hg has uncommitted changes
	const { config, accountId, name } = props;
	if (!props.dispatchNamespace && accountId && name) {
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
					return {};
				}
			} else if (default_environment.script.last_deployed_from === "api") {
				logger.warn(
					`You are about to publish a Workers Service that was last updated via the script API.\nEdits that have been made via the script API will be overridden by your local code and config.`
				);
				if (!(await confirm("Would you like to continue?"))) {
					return {};
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

		throw new UserError(`A compatibility_date is required when publishing. Add the following to your wrangler.toml file:.
    \`\`\`
    compatibility_date = "${compatibilityDateStr}"
    \`\`\`
    Or you could pass it in your terminal as \`--compatibility-date ${compatibilityDateStr}\`
See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information.`);
	}

	const routes =
		props.routes ?? config.routes ?? (config.route ? [config.route] : []) ?? [];
	for (const route of routes) {
		if (typeof route !== "string" && route.custom_domain) {
			if (route.pattern.includes("*")) {
				throw new UserError(
					`Cannot use "${route.pattern}" as a Custom Domain; wildcard operators (*) are not allowed`
				);
			}
			if (route.pattern.includes("/")) {
				throw new UserError(
					`Cannot use "${route.pattern}" as a Custom Domain; paths are not allowed`
				);
			}
		}
	}

	const jsxFactory = props.jsxFactory || config.jsx_factory;
	const jsxFragment = props.jsxFragment || config.jsx_fragment;
	const keepVars = props.keepVars || config.keep_vars;

	const minify = props.minify ?? config.minify;

	const nodejsCompatMode = validateNodeCompat({
		legacyNodeCompat: props.nodeCompat ?? config.node_compat ?? false,
		compatibilityFlags: props.compatibilityFlags ?? config.compatibility_flags,
		noBundle: props.noBundle ?? config.no_bundle ?? false,
	});
	const compatibilityFlags =
		props.compatibilityFlags ?? config.compatibility_flags;

	// Warn if user tries minify with no-bundle
	if (props.noBundle && minify) {
		logger.warn(
			"`--minify` and `--no-bundle` can't be used together. If you want to minify your Worker and disable Wrangler's bundling, please minify as part of your own bundling process."
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
	const prod = Boolean(props.legacyEnv || !props.env);
	const notProd = !prod;
	const workerName = notProd ? `${scriptName} (${envName})` : scriptName;
	const workerUrl = props.dispatchNamespace
		? `/accounts/${accountId}/workers/dispatch/namespaces/${props.dispatchNamespace}/scripts/${scriptName}`
		: notProd
			? `/accounts/${accountId}/workers/services/${scriptName}/environments/${envName}`
			: `/accounts/${accountId}/workers/scripts/${scriptName}`;

	let deploymentId: string | null = null;

	const { format } = props.entry;

	if (!props.dispatchNamespace && prod && accountId && scriptName) {
		const yes = await confirmLatestDeploymentOverwrite(accountId, scriptName);
		if (!yes) {
			cancel("Aborting deploy...");
			return {};
		}
	}

	if (
		!props.isWorkersSite &&
		Boolean(props.assetPaths) &&
		format === "service-worker"
	) {
		throw new UserError(
			"You cannot use the service-worker format with an `assets` directory yet. For information on how to migrate to the module-worker format, see: https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/"
		);
	}

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

	let sourceMapSize;

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
			preserveFileNames: config.preserve_file_names ?? false,
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
						serveAssetsFromWorker:
							!props.isWorkersSite && Boolean(props.assetPaths),
						doBindings: config.durable_objects.bindings,
						jsxFactory,
						jsxFragment,
						tsconfig: props.tsconfig ?? config.tsconfig,
						minify,
						sourcemap: uploadSourceMaps,
						nodejsCompatMode,
						define: { ...config.define, ...props.defines },
						checkFetch: false,
						alias: config.alias,
						legacyAssets: config.legacy_assets,
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

		const assets = await syncAssets(
			accountId,
			// When we're using the newer service environments, we wouldn't
			// have added the env name on to the script name. However, we must
			// include it in the kv namespace name regardless (since there's no
			// concept of service environments for kv namespaces yet).
			scriptName + (!props.legacyEnv && props.env ? `-${props.env}` : ""),
			props.assetPaths,
			false,
			props.dryRun,
			props.oldAssetTtl
		);

		const bindings: CfWorkerInit["bindings"] = {
			kv_namespaces: (config.kv_namespaces || []).concat(
				assets.namespace
					? { binding: "__STATIC_CONTENT", id: assets.namespace }
					: []
			),
			send_email: config.send_email,
			vars: { ...config.vars, ...props.vars },
			wasm_modules: config.wasm_modules,
			browser: config.browser,
			ai: config.ai,
			version_metadata: config.version_metadata,
			text_blobs: {
				...config.text_blobs,
				...(assets.manifest &&
					format === "service-worker" && {
						__STATIC_CONTENT_MANIFEST: "__STATIC_CONTENT_MANIFEST",
					}),
			},
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

		if (assets.manifest) {
			modules.push({
				name: "__STATIC_CONTENT_MANIFEST",
				filePath: undefined,
				content: JSON.stringify(assets.manifest),
				type: "text",
			});
		}

		// The upload API only accepts an empty string or no specified placement for the "off" mode.
		const placement: CfPlacement | undefined =
			config.placement?.mode === "smart" ? { mode: "smart" } : undefined;

		const entryPointName = path.basename(resolvedEntryPointPath);
		const main: CfModule = {
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
			keepVars,
			keepSecrets: keepVars, // keepVars implies keepSecrets
			logpush: props.logpush !== undefined ? props.logpush : config.logpush,
			placement,
			tail_consumers: config.tail_consumers,
			limits: config.limits,
		};

		sourceMapSize = worker.sourceMaps?.reduce(
			(acc, m) => acc + m.content.length,
			0
		);

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

		printBindings({ ...withoutStaticAssets, vars: maskedVars });

		if (!props.dryRun) {
			await ensureQueuesExistByConfig(config);

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

				deploymentId = addHyphens(result.deployment_id) ?? result.deployment_id;

				if (config.first_party_worker) {
					// Print some useful information returned after publishing
					// Not all fields will be populated for every worker
					// These fields are likely to be scraped by tools, so do not rename
					if (result.id) {
						logger.log("Worker ID: ", result.id);
					}
					if (result.etag) {
						logger.log("Worker ETag: ", result.etag);
					}
					if (result.pipeline_hash) {
						logger.log("Worker PipelineHash: ", result.pipeline_hash);
					}
					if (result.mutable_pipeline_id) {
						logger.log(
							"Worker Mutable PipelineID (Development ONLY!):",
							result.mutable_pipeline_id
						);
					}
				}
			} catch (err) {
				helpIfErrorIsSizeOrScriptStartup(err, dependencies);

				// Apply source mapping to validation startup errors if possible
				if (
					err instanceof APIError &&
					"code" in err &&
					err.code === 10021 /* validation error */ &&
					err.notes.length > 0
				) {
					err.preventReport();

					if (
						err.notes[0].text ===
						"binding DB of type d1 must have a valid `id` specified [code: 10021]"
					) {
						throw new UserError(
							"You must use a real database in the database_id configuration. You can find your databases using 'wrangler d1 list', or read how to develop locally with D1 here: https://developers.cloudflare.com/d1/configuration/local-development"
						);
					}

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
		return {};
	}
	assert(accountId, "Missing accountId");

	const uploadMs = Date.now() - start;

	logger.log("Uploaded", workerName, formatTime(uploadMs));

	// Early exit for WfP since it doesn't need the below code
	if (props.dispatchNamespace !== undefined) {
		deployWfpUserWorker(props.dispatchNamespace, deploymentId);
		return {};
	}

	// deploy triggers
	await triggersDeploy(props);

	logger.log("Current Deployment ID:", deploymentId);
	logger.log("Current Version ID:", deploymentId);

	logVersionIdChange();

	return { sourceMapSize };
}

function deployWfpUserWorker(
	dispatchNamespace: string,
	deploymentId: string | null
) {
	// Will go under the "Uploaded" text
	logger.log("  Dispatch Namespace:", dispatchNamespace);
	logger.log("Current Deployment ID:", deploymentId);
	logger.log("Current Version ID:", deploymentId);

	logVersionIdChange();
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

export function formatTime(duration: number) {
	return `(${(duration / 1000).toFixed(2)} sec)`;
}

/**
 * Associate the newly deployed Worker with the given routes.
 */
export async function publishRoutes(
	routes: Route[],
	{
		workerUrl,
		scriptName,
		notProd,
		accountId,
	}: {
		workerUrl: string;
		scriptName: string;
		notProd: boolean;
		accountId: string;
	}
): Promise<string[]> {
	try {
		return await fetchResult(`${workerUrl}/routes`, {
			// Note: PUT will delete previous routes on this script.
			method: "PUT",
			body: JSON.stringify(
				routes.map((route) =>
					typeof route !== "object" ? { pattern: route } : route
				)
			),
			headers: {
				"Content-Type": "application/json",
			},
		});
	} catch (e) {
		if (isAuthenticationError(e)) {
			// An authentication error is probably due to a known issue,
			// where the user is logged in via an API token that does not have "All Zones".
			return await publishRoutesFallback(routes, {
				scriptName,
				notProd,
				accountId,
			});
		} else {
			throw e;
		}
	}
}

/**
 * Try updating routes for the Worker using a less optimal zone-based API.
 *
 * Compute match zones to the routes, then for each route attempt to connect it to the Worker via the zone.
 */
async function publishRoutesFallback(
	routes: Route[],
	{
		scriptName,
		notProd,
		accountId,
	}: { scriptName: string; notProd: boolean; accountId: string }
) {
	if (notProd) {
		throw new UserError(
			"Service environments combined with an API token that doesn't have 'All Zones' permissions is not supported.\n" +
				"Either turn off service environments by setting `legacy_env = true`, creating an API token with 'All Zones' permissions, or logging in via OAuth"
		);
	}
	logger.warn(
		"The current authentication token does not have 'All Zones' permissions.\n" +
			"Falling back to using the zone-based API endpoint to update each route individually.\n" +
			"Note that there is no access to routes associated with zones that the API token does not have permission for.\n" +
			"Existing routes for this Worker in such zones will not be deleted."
	);

	const deployedRoutes: string[] = [];

	// Collect the routes (and their zones) that will be deployed.
	const activeZones = new Map<string, string>();
	const routesToDeploy = new Map<string, string>();
	for (const route of routes) {
		const zone = await getZoneForRoute({ route, accountId });
		if (zone) {
			activeZones.set(zone.id, zone.host);
			routesToDeploy.set(
				typeof route === "string" ? route : route.pattern,
				zone.id
			);
		}
	}

	// Collect the routes that are already deployed.
	const allRoutes = new Map<string, string>();
	const alreadyDeployedRoutes = new Set<string>();
	for (const [zone, host] of activeZones) {
		try {
			for (const { pattern, script } of await fetchListResult<{
				pattern: string;
				script: string;
			}>(`/zones/${zone}/workers/routes`)) {
				allRoutes.set(pattern, script);
				if (script === scriptName) {
					alreadyDeployedRoutes.add(pattern);
				}
			}
		} catch (e) {
			if (isAuthenticationError(e)) {
				e.notes.push({
					text: `This could be because the API token being used does not have permission to access the zone "${host}" (${zone}).`,
				});
			}
			throw e;
		}
	}

	// Deploy each route that is not already deployed.
	for (const [routePattern, zoneId] of routesToDeploy.entries()) {
		if (allRoutes.has(routePattern)) {
			const knownScript = allRoutes.get(routePattern);
			if (knownScript === scriptName) {
				// This route is already associated with this worker, so no need to hit the API.
				alreadyDeployedRoutes.delete(routePattern);
				continue;
			} else {
				throw new UserError(
					`The route with pattern "${routePattern}" is already associated with another worker called "${knownScript}".`
				);
			}
		}

		const { pattern } = await fetchResult<{ pattern: string }>(
			`/zones/${zoneId}/workers/routes`,
			{
				method: "POST",
				body: JSON.stringify({
					pattern: routePattern,
					script: scriptName,
				}),
				headers: {
					"Content-Type": "application/json",
				},
			}
		);

		deployedRoutes.push(pattern);
	}

	if (alreadyDeployedRoutes.size) {
		logger.warn(
			"Previously deployed routes:\n" +
				"The following routes were already associated with this worker, and have not been deleted:\n" +
				[...alreadyDeployedRoutes.values()].map((route) => ` - "${route}"\n`) +
				"If these routes are not wanted then you can remove them in the dashboard."
		);
	}

	return deployedRoutes;
}

export function isAuthenticationError(e: unknown): e is ParseError {
	// TODO: don't want to report these
	return e instanceof ParseError && (e as { code?: number }).code === 10000;
}

export async function updateQueueProducers(
	config: Config
): Promise<Promise<string[]>[]> {
	const producers = config.queues.producers || [];
	const updateProducers: Promise<string[]>[] = [];
	for (const producer of producers) {
		const body: PostQueueBody = {
			queue_name: producer.queue,
			settings: {
				delivery_delay: producer.delivery_delay,
			},
		};

		updateProducers.push(
			putQueue(config, producer.queue, body).then(() => [
				`Producer for ${producer.queue}`,
			])
		);
	}

	return updateProducers;
}

export async function updateQueueConsumers(
	scriptName: string | undefined,
	config: Config
): Promise<Promise<string[]>[]> {
	const consumers = config.queues.consumers || [];
	const updateConsumers: Promise<string[]>[] = [];
	for (const consumer of consumers) {
		const queue = await getQueue(config, consumer.queue);

		if (consumer.type === "http_pull") {
			const body: PostTypedConsumerBody = {
				type: consumer.type,
				dead_letter_queue: consumer.dead_letter_queue,
				settings: {
					batch_size: consumer.max_batch_size,
					max_retries: consumer.max_retries,
					visibility_timeout_ms: consumer.visibility_timeout_ms,
					retry_delay: consumer.retry_delay,
				},
			};

			const existingConsumer = queue.consumers && queue.consumers[0];
			if (existingConsumer) {
				updateConsumers.push(
					putConsumerById(
						config,
						queue.queue_id,
						existingConsumer.consumer_id,
						body
					).then(() => [`Consumer for ${consumer.queue}`])
				);
				continue;
			}
			updateConsumers.push(
				postConsumer(config, consumer.queue, body).then(() => [
					`Consumer for ${consumer.queue}`,
				])
			);
		} else {
			if (scriptName === undefined) {
				// TODO: how can we reliably get the current script name?
				throw new UserError(
					"Script name is required to update queue consumers"
				);
			}

			const body: PostTypedConsumerBody = {
				type: "worker",
				dead_letter_queue: consumer.dead_letter_queue,
				script_name: scriptName,
				settings: {
					batch_size: consumer.max_batch_size,
					max_retries: consumer.max_retries,
					max_wait_time_ms:
						consumer.max_batch_timeout !== undefined
							? 1000 * consumer.max_batch_timeout
							: undefined,
					max_concurrency: consumer.max_concurrency,
					retry_delay: consumer.retry_delay,
				},
			};

			// Current script already assigned to queue?
			const existingConsumer =
				queue.consumers.filter(
					(c) => c.script === scriptName || c.service === scriptName
				).length > 0;
			const envName = undefined; // TODO: script environment for wrangler deploy?
			if (existingConsumer) {
				updateConsumers.push(
					putConsumer(config, consumer.queue, scriptName, envName, body).then(
						() => [`Consumer for ${consumer.queue}`]
					)
				);
				continue;
			}
			updateConsumers.push(
				postConsumer(config, consumer.queue, body).then(() => [
					`Consumer for ${consumer.queue}`,
				])
			);
		}
	}

	return updateConsumers;
}

export async function noBundleWorker(
	entry: Entry,
	rules: Rule[],
	outDir: string | undefined
) {
	const modules = await findAdditionalModules(entry, rules);
	if (outDir) {
		await writeAdditionalModules(modules, outDir);
	}

	const bundleType = getBundleType(entry.format, entry.file);
	return {
		modules,
		dependencies: {} as { [path: string]: { bytesInOutput: number } },
		resolvedEntryPointPath: entry.file,
		bundleType,
	};
}
