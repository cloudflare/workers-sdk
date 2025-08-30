import assert from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { URLSearchParams } from "node:url";
import { cancel } from "@cloudflare/cli";
import { verifyDockerInstalled } from "@cloudflare/containers-shared";
import PQueue from "p-queue";
import { Response } from "undici";
import { syncAssets } from "../assets";
import { fetchListResult, fetchResult } from "../cfetch";
import { buildContainer, deployContainers } from "../cloudchamber/deploy";
import { configFileName, formatConfigSnippet } from "../config";
import { getNormalizedContainerOptions } from "../containers/config";
import { getBindings, provisionBindings } from "../deployment-bundle/bindings";
import { bundleWorker } from "../deployment-bundle/bundle";
import { printBundleSize } from "../deployment-bundle/bundle-reporter";
import { createWorkerUploadForm } from "../deployment-bundle/create-worker-upload-form";
import { logBuildOutput } from "../deployment-bundle/esbuild-plugins/log-build-output";
import {
	createModuleCollector,
	getWrangler1xLegacyModuleReferences,
} from "../deployment-bundle/module-collection";
import { noBundleWorker } from "../deployment-bundle/no-bundle-worker";
import { validateNodeCompatMode } from "../deployment-bundle/node-compat";
import { loadSourceMaps } from "../deployment-bundle/source-maps";
import { confirm as genericConfirm } from "../dialogs";
import { getMigrationsToUpload } from "../durable";
import { getDockerPath } from "../environment-variables/misc-variables";
import { UserError } from "../errors";
import { getFlag } from "../experimental-flags";
import { downloadWorkerConfig } from "../init";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { getMetricsUsageHeaders } from "../metrics";
import { isNavigatorDefined } from "../navigator-user-agent";
import { APIError, ParseError, parseNonHyphenedUuid } from "../parse";
import { getWranglerTmpDir } from "../paths";
import {
	ensureQueuesExistByConfig,
	getQueue,
	postConsumer,
	putConsumer,
	putConsumerById,
} from "../queues/client";
import { syncWorkersSite } from "../sites";
import {
	getSourceMappedString,
	maybeRetrieveFileSourceMap,
} from "../sourcemap";
import triggersDeploy from "../triggers/deploy";
import { formatCompatibilityDate } from "../utils/compatibility-date";
import { helpIfErrorIsSizeOrScriptStartup } from "../utils/friendly-validator-errors";
import { printBindings } from "../utils/print-bindings";
import { retryOnAPIFailure } from "../utils/retry";
import {
	createDeployment,
	patchNonVersionedScriptSettings,
} from "../versions/api";
import { confirmLatestDeploymentOverwrite } from "../versions/deploy";
import { getZoneForRoute } from "../zones";
import { getRemoteConfigDiff } from "./config-diffs";
import type { AssetsOptions } from "../assets";
import type { Config } from "../config";
import type {
	CustomDomainRoute,
	Route,
	ZoneIdRoute,
	ZoneNameRoute,
} from "../config/environment";
import type { Entry } from "../deployment-bundle/entry";
import type {
	CfModule,
	CfPlacement,
	CfWorkerInit,
} from "../deployment-bundle/worker";
import type { ComplianceConfig } from "../environment-variables/misc-variables";
import type { PostTypedConsumerBody } from "../queues/client";
import type { LegacyAssetPaths } from "../sites";
import type { RetrieveSourceMapFunction } from "../sourcemap";
import type { ApiVersion, Percentage, VersionId } from "../versions/types";
import type { FormData } from "undici";

type Props = {
	config: Config;
	accountId: string | undefined;
	entry: Entry;
	rules: Config["rules"];
	name: string;
	env: string | undefined;
	compatibilityDate: string | undefined;
	compatibilityFlags: string[] | undefined;
	legacyAssetPaths: LegacyAssetPaths | undefined;
	assetsOptions: AssetsOptions | undefined;
	vars: Record<string, string> | undefined;
	defines: Record<string, string> | undefined;
	alias: Record<string, string> | undefined;
	triggers: string[] | undefined;
	routes: string[] | undefined;
	domains: string[] | undefined;
	legacyEnv: boolean | undefined;
	jsxFactory: string | undefined;
	jsxFragment: string | undefined;
	tsconfig: string | undefined;
	isWorkersSite: boolean;
	minify: boolean | undefined;
	outDir: string | undefined;
	outFile: string | undefined;
	dryRun: boolean | undefined;
	noBundle: boolean | undefined;
	keepVars: boolean | undefined;
	logpush: boolean | undefined;
	uploadSourceMaps: boolean | undefined;
	oldAssetTtl: number | undefined;
	projectRoot: string | undefined;
	dispatchNamespace: string | undefined;
	experimentalAutoCreate: boolean;
	metafile: string | boolean | undefined;
	containersRollout: "immediate" | "gradual" | undefined;
	strict: boolean | undefined;
	force: boolean | undefined;
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

export const validateRoutes = (routes: Route[], assets?: AssetsOptions) => {
	const invalidRoutes: Record<string, string[]> = {};
	const mountedAssetRoutes: string[] = [];

	for (const route of routes) {
		if (typeof route !== "string" && route.custom_domain) {
			if (route.pattern.includes("*")) {
				invalidRoutes[route.pattern] ??= [];
				invalidRoutes[route.pattern].push(
					`Wildcard operators (*) are not allowed in Custom Domains`
				);
			}
			if (route.pattern.includes("/")) {
				invalidRoutes[route.pattern] ??= [];
				invalidRoutes[route.pattern].push(
					`Paths are not allowed in Custom Domains`
				);
			}
		} else if (
			// If we have Assets but we're not always hitting the Worker then validate
			assets?.directory !== undefined &&
			assets.routerConfig.invoke_user_worker_ahead_of_assets !== true
		) {
			const pattern = typeof route === "string" ? route : route.pattern;
			const components = pattern.split("/");

			// If this isn't `domain.com/*` then we're mounting to a path
			if (!(components.length === 2 && components[1] === "*")) {
				mountedAssetRoutes.push(pattern);
			}
		}
	}
	if (Object.keys(invalidRoutes).length > 0) {
		throw new UserError(
			`Invalid Routes:\n` +
				Object.entries(invalidRoutes)
					.map(([route, errors]) => `${route}:\n` + errors.join("\n"))
					.join(`\n\n`)
		);
	}

	if (mountedAssetRoutes.length > 0 && assets?.directory !== undefined) {
		const relativeAssetsDir = path.relative(process.cwd(), assets.directory);

		logger.once.warn(
			`Warning: The following routes will attempt to serve Assets on a configured path:\n${mountedAssetRoutes
				.map((route) => {
					const routeNoScheme = route.replace(/https?:\/\//g, "");
					const assetPath = path.join(
						relativeAssetsDir,
						routeNoScheme.substring(routeNoScheme.indexOf("/"))
					);
					return `  • ${route} (Will match assets: ${assetPath})`;
				})
				.join("\n")}` +
				(assets?.routerConfig.has_user_worker
					? "\n\nRequests not matching an asset will be forwarded to the Worker's code."
					: "")
		);
	}
};

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
	complianceConfig: ComplianceConfig,
	workerUrl: string,
	accountId: string,
	domains: Array<RouteObject>
): Promise<string[]> {
	const options = {
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
		options.override_existing_origin = true;
		options.override_existing_dns_record = true;
	} else {
		// get a changeset for operations required to achieve a state with the requested domains
		const changeset = await fetchResult<CustomDomainChangeset>(
			complianceConfig,
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
						complianceConfig,
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
			if (!(await genericConfirm(message))) {
				return fail();
			}
			options.override_existing_origin = true;
		}

		if (changeset.conflicting.length > 0) {
			const conflicitingRendered = changeset.conflicting
				.map((domain) => `\t• ${domain.hostname}`)
				.join("\n");
			const message = `You already have DNS records that conflict for these Custom Domains:
${conflicitingRendered}
Update them to point to this script instead?`;
			if (!(await genericConfirm(message))) {
				return fail();
			}
			options.override_existing_dns_record = true;
		}
	}

	// deploy to domains
	await fetchResult(complianceConfig, `${workerUrl}/domains/records`, {
		method: "PUT",
		body: JSON.stringify({ ...options, origins }),
		headers: {
			"Content-Type": "application/json",
		},
	});

	return domains.map((domain) => renderRoute(domain));
}

export default async function deploy(props: Props): Promise<{
	sourceMapSize?: number;
	versionId: string | null;
	workerTag: string | null;
	targets?: string[];
}> {
	const deployConfirm = getDeployConfirmFunction(props.strict && !props.force);

	// TODO: warn if git/hg has uncommitted changes
	const { config, accountId, name, entry } = props;
	let workerTag: string | null = null;
	let versionId: string | null = null;

	let workerExists: boolean = true;

	const domainRoutes = (props.domains || []).map((domain) => ({
		pattern: domain,
		custom_domain: true,
	}));
	const routes =
		props.routes ?? config.routes ?? (config.route ? [config.route] : []) ?? [];
	const allDeploymentRoutes = [...routes, ...domainRoutes];

	if (!props.dispatchNamespace && accountId) {
		try {
			const serviceMetaData = await fetchResult<{
				default_environment: {
					environment: string;
					script: {
						tag: string;
						last_deployed_from: "dash" | "wrangler" | "api";
					};
				};
			}>(config, `/accounts/${accountId}/workers/services/${name}`);
			const {
				default_environment: { script },
			} = serviceMetaData;
			workerTag = script.tag;

			if (script.last_deployed_from === "dash") {
				let configDiff: ReturnType<typeof getRemoteConfigDiff> | undefined;
				if (getFlag("DEPLOY_REMOTE_DIFF_CHECK")) {
					const remoteWorkerConfig = await downloadWorkerConfig(
						accountId,
						name,
						entry.file,
						serviceMetaData.default_environment.environment
					);

					configDiff = getRemoteConfigDiff(remoteWorkerConfig, {
						...config,
						// We also want to include all the routes used for deployment
						routes: allDeploymentRoutes,
					});
				}

				if (configDiff) {
					// If there are only additive changes (or no changes at all) there should be no problem,
					// just using the local config (and override the remote one) should be totally fine
					if (!configDiff.nonDestructive) {
						logger.warn(
							"The local configuration being used (generated from your local configuration file) differs from the remote configuration of your Worker set via the Cloudflare Dashboard:" +
								`\n${configDiff.diff}\n\n` +
								"Deploying the Worker will override the remote configuration with your local one."
						);
						if (!(await deployConfirm("Would you like to continue?"))) {
							return { versionId, workerTag };
						}
					}
				} else {
					logger.warn(
						`You are about to publish a Workers Service that was last published via the Cloudflare Dashboard.\nEdits that have been made via the dashboard will be overridden by your local code and config.`
					);
					if (!(await deployConfirm("Would you like to continue?"))) {
						return { versionId, workerTag };
					}
				}
			} else if (script.last_deployed_from === "api") {
				logger.warn(
					`You are about to publish a Workers Service that was last updated via the script API.\nEdits that have been made via the script API will be overridden by your local code and config.`
				);
				if (!(await deployConfirm("Would you like to continue?"))) {
					return { versionId, workerTag };
				}
			}
		} catch (e) {
			// code: 10090, message: workers.api.error.service_not_found
			// is thrown from the above fetchResult on the first deploy of a Worker
			if ((e as { code?: number }).code !== 10090) {
				throw e;
			} else {
				workerExists = false;
			}
		}
	}

	const compatibilityDate =
		props.compatibilityDate ?? config.compatibility_date;
	const compatibilityFlags =
		props.compatibilityFlags ?? config.compatibility_flags;

	if (!compatibilityDate) {
		const compatibilityDateStr = formatCompatibilityDate(new Date());

		throw new UserError(
			`A compatibility_date is required when publishing. Add the following to your ${configFileName(config.configPath)} file:
    \`\`\`
    ${formatConfigSnippet({ compatibility_date: compatibilityDateStr }, config.configPath, false)}
    \`\`\`
    Or you could pass it in your terminal as \`--compatibility-date ${compatibilityDateStr}\`
See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information.`,
			{ telemetryMessage: "missing compatibility date when deploying" }
		);
	}

	validateRoutes(allDeploymentRoutes, props.assetsOptions);

	const jsxFactory = props.jsxFactory || config.jsx_factory;
	const jsxFragment = props.jsxFragment || config.jsx_fragment;
	const keepVars = props.keepVars || config.keep_vars;

	const minify = props.minify ?? config.minify;

	const nodejsCompatMode = validateNodeCompatMode(
		compatibilityDate,
		compatibilityFlags,
		{
			noBundle: props.noBundle ?? config.no_bundle,
		}
	);

	// Warn if user tries minify with no-bundle
	if (props.noBundle && minify) {
		logger.warn(
			"`--minify` and `--no-bundle` can't be used together. If you want to minify your Worker and disable Wrangler's bundling, please minify as part of your own bundling process."
		);
	}

	const scriptName = props.name;

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

	const { format } = props.entry;

	if (!props.dispatchNamespace && prod && accountId && scriptName) {
		const yes = await confirmLatestDeploymentOverwrite(
			config,
			accountId,
			scriptName
		);
		if (!yes) {
			cancel("Aborting deploy...");
			return { versionId, workerTag };
		}
	}

	if (
		!props.isWorkersSite &&
		Boolean(props.legacyAssetPaths) &&
		format === "service-worker"
	) {
		throw new UserError(
			"You cannot use the service-worker format with an `assets` directory yet. For information on how to migrate to the module-worker format, see: https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/",
			{ telemetryMessage: true }
		);
	}

	if (config.wasm_modules && format === "modules") {
		throw new UserError(
			"You cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code",
			{ telemetryMessage: true }
		);
	}

	if (config.text_blobs && format === "modules") {
		throw new UserError(
			`You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your ${configFileName(config.configPath)} file`,
			{ telemetryMessage: "[text_blobs] with an ES module worker" }
		);
	}

	if (config.data_blobs && format === "modules") {
		throw new UserError(
			`You cannot configure [data_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your ${configFileName(config.configPath)} file`,
			{ telemetryMessage: "[data_blobs] with an ES module worker" }
		);
	}

	let sourceMapSize;
	const normalisedContainerConfig = await getNormalizedContainerOptions(
		config,
		props
	);
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
						metafile: props.metafile,
						bundle: true,
						additionalModules: [],
						moduleCollector,
						doBindings: config.durable_objects.bindings,
						workflowBindings: config.workflows ?? [],
						jsxFactory,
						jsxFragment,
						tsconfig: props.tsconfig ?? config.tsconfig,
						minify,
						keepNames: config.keep_names ?? true,
						sourcemap: uploadSourceMaps,
						nodejsCompatMode,
						compatibilityDate,
						compatibilityFlags,
						define: { ...config.define, ...props.defines },
						checkFetch: false,
						alias: config.alias,
						// We want to know if the build is for development or publishing
						// This could potentially cause issues as we no longer have identical behaviour between dev and deploy?
						targetConsumer: "deploy",
						local: false,
						projectRoot: props.projectRoot,
						defineNavigatorUserAgent: isNavigatorDefined(
							compatibilityDate,
							compatibilityFlags
						),
						plugins: [logBuildOutput(nodejsCompatMode)],

						// Pages specific options used by wrangler pages commands
						entryName: undefined,
						inject: undefined,
						isOutfile: undefined,
						external: undefined,

						// These options are dev-only
						testScheduled: undefined,
						watch: undefined,
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
					dispatchNamespace: props.dispatchNamespace,
				})
			: undefined;

		// Upload assets if assets is being used
		const assetsJwt =
			props.assetsOptions && !props.dryRun
				? await syncAssets(
						config,
						accountId,
						props.assetsOptions.directory,
						scriptName,
						props.dispatchNamespace
					)
				: undefined;

		const workersSitesAssets = await syncWorkersSite(
			config,
			accountId,
			// When we're using the newer service environments, we wouldn't
			// have added the env name on to the script name. However, we must
			// include it in the kv namespace name regardless (since there's no
			// concept of service environments for kv namespaces yet).
			scriptName + (!props.legacyEnv && props.env ? `-${props.env}` : ""),
			props.legacyAssetPaths,
			false,
			props.dryRun,
			props.oldAssetTtl
		);

		const bindings = getBindings({
			...config,
			kv_namespaces: config.kv_namespaces.concat(
				workersSitesAssets.namespace
					? { binding: "__STATIC_CONTENT", id: workersSitesAssets.namespace }
					: []
			),
			vars: { ...config.vars, ...props.vars },
			text_blobs: {
				...config.text_blobs,
				...(workersSitesAssets.manifest &&
					format === "service-worker" && {
						__STATIC_CONTENT_MANIFEST: "__STATIC_CONTENT_MANIFEST",
					}),
			},
		});

		if (workersSitesAssets.manifest) {
			modules.push({
				name: "__STATIC_CONTENT_MANIFEST",
				filePath: undefined,
				content: JSON.stringify(workersSitesAssets.manifest),
				type: "text",
			});
		}

		// The upload API only accepts an empty string or no specified placement for the "off" mode.
		const placement: CfPlacement | undefined =
			config.placement?.mode === "smart"
				? { mode: "smart", hint: config.placement.hint }
				: undefined;

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
			containers: config.containers ?? undefined,
			sourceMaps: uploadSourceMaps
				? loadSourceMaps(main, modules, bundle)
				: undefined,
			compatibility_date: compatibilityDate,
			compatibility_flags: compatibilityFlags,
			keepVars,
			keepSecrets: keepVars, // keepVars implies keepSecrets
			logpush: props.logpush !== undefined ? props.logpush : config.logpush,
			placement,
			tail_consumers: config.tail_consumers,
			limits: config.limits,
			assets:
				props.assetsOptions && assetsJwt
					? {
							jwt: assetsJwt,
							routerConfig: props.assetsOptions.routerConfig,
							assetConfig: props.assetsOptions.assetConfig,
							_redirects: props.assetsOptions._redirects,
							_headers: props.assetsOptions._headers,
							run_worker_first: props.assetsOptions.run_worker_first,
						}
					: undefined,
			observability: config.observability,
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

		// We can use the new versions/deployments APIs if we:
		// * are uploading a worker that already exists
		// * aren't a dispatch namespace deploy
		// * aren't a service env deploy
		// * aren't a service Worker
		// * we don't have DO migrations
		// * we aren't an fpw
		// * not a container worker
		const canUseNewVersionsDeploymentsApi =
			workerExists &&
			props.dispatchNamespace === undefined &&
			prod &&
			format === "modules" &&
			migrations === undefined &&
			!config.first_party_worker &&
			config.containers === undefined;

		let workerBundle: FormData;
		const dockerPath = getDockerPath();

		// lets fail earlier in the case where docker isn't installed
		// and we have containers so that we don't get into a
		// disjointed state where the worker updates but the container
		// fails.
		if (normalisedContainerConfig.length) {
			// if you have a registry url specified, you don't need docker
			const hasDockerfiles = normalisedContainerConfig.some(
				(container) => "dockerfile" in container
			);
			if (hasDockerfiles) {
				await verifyDockerInstalled(dockerPath, false);
			}
		}

		if (props.dryRun) {
			if (normalisedContainerConfig.length) {
				for (const container of normalisedContainerConfig) {
					if ("dockerfile" in container) {
						await buildContainer(
							container,
							workerTag ?? "worker-tag",
							props.dryRun,
							dockerPath
						);
					}
				}
			}

			workerBundle = createWorkerUploadForm(worker);
			printBindings(
				{ ...withoutStaticAssets, vars: maskedVars },
				config.tail_consumers,
				{ warnIfNoBindings: true }
			);
		} else {
			assert(accountId, "Missing accountId");

			if (getFlag("RESOURCES_PROVISION")) {
				await provisionBindings(
					bindings,
					accountId,
					scriptName,
					props.experimentalAutoCreate,
					props.config
				);
			}
			workerBundle = createWorkerUploadForm(worker);

			await ensureQueuesExistByConfig(config);
			let bindingsPrinted = false;

			// Upload the script so it has time to propagate.
			try {
				let result: {
					id: string | null;
					etag: string | null;
					pipeline_hash: string | null;
					mutable_pipeline_id: string | null;
					deployment_id: string | null;
					startup_time_ms?: number;
				};

				// If we're using the new APIs, first upload the version
				if (canUseNewVersionsDeploymentsApi) {
					// Upload new version
					const versionResult = await retryOnAPIFailure(async () =>
						fetchResult<ApiVersion>(
							config,
							`/accounts/${accountId}/workers/scripts/${scriptName}/versions`,
							{
								method: "POST",
								body: workerBundle,
								headers: await getMetricsUsageHeaders(config.send_metrics),
							}
						)
					);

					// Deploy new version to 100%
					const versionMap = new Map<VersionId, Percentage>();
					versionMap.set(versionResult.id, 100);
					await createDeployment(
						props.config,
						accountId,
						scriptName,
						versionMap,
						undefined
					);

					// Update tail consumers, logpush, and observability settings
					await patchNonVersionedScriptSettings(
						props.config,
						accountId,
						scriptName,
						{
							tail_consumers: worker.tail_consumers,
							logpush: worker.logpush,
							// If the user hasn't specified observability assume that they want it disabled if they have it on.
							// This is a no-op in the event that they don't have observability enabled, but will remove observability
							// if it has been removed from their Wrangler configuration file
							observability: worker.observability ?? { enabled: false },
						}
					);

					result = {
						id: null, // fpw - ignore
						etag: versionResult.resources.script.etag,
						pipeline_hash: null, // fpw - ignore
						mutable_pipeline_id: null, // fpw - ignore
						deployment_id: versionResult.id, // version id not deployment id but easier to adapt here
						startup_time_ms: versionResult.startup_time_ms,
					};
				} else {
					result = await retryOnAPIFailure(async () =>
						fetchResult<{
							id: string | null;
							etag: string | null;
							pipeline_hash: string | null;
							mutable_pipeline_id: string | null;
							deployment_id: string | null;
							startup_time_ms: number;
						}>(
							config,
							workerUrl,
							{
								method: "PUT",
								body: workerBundle,
								headers: await getMetricsUsageHeaders(config.send_metrics),
							},
							new URLSearchParams({
								// pass excludeScript so the whole body of the
								// script doesn't get included in the response
								excludeScript: "true",
							})
						)
					);
				}

				if (result.startup_time_ms) {
					logger.log("Worker Startup Time:", result.startup_time_ms, "ms");
				}
				bindingsPrinted = true;

				printBindings(
					{ ...withoutStaticAssets, vars: maskedVars },
					config.tail_consumers
				);

				versionId = parseNonHyphenedUuid(result.deployment_id);

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
				if (!bindingsPrinted) {
					printBindings(
						{ ...withoutStaticAssets, vars: maskedVars },
						config.tail_consumers
					);
				}
				const message = await helpIfErrorIsSizeOrScriptStartup(
					err,
					dependencies,
					workerBundle,
					props.projectRoot
				);
				if (message !== null) {
					logger.error(message);
				}

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
							"You must use a real database in the database_id configuration. You can find your databases using 'wrangler d1 list', or read how to develop locally with D1 here: https://developers.cloudflare.com/d1/configuration/local-development",
							{ telemetryMessage: true }
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
		if (props.outFile) {
			// we're using a custom output file,
			// so let's first ensure it's parent directory exists
			mkdirSync(path.dirname(props.outFile), { recursive: true });

			const serializedFormData = await new Response(workerBundle).arrayBuffer();

			writeFileSync(props.outFile, Buffer.from(serializedFormData));
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

	const uploadMs = Date.now() - start;

	logger.log("Uploaded", workerName, formatTime(uploadMs));

	// Early exit for WfP since it doesn't need the below code
	if (props.dispatchNamespace !== undefined) {
		deployWfpUserWorker(props.dispatchNamespace, versionId);
		return { versionId, workerTag };
	}

	if (normalisedContainerConfig.length) {
		assert(versionId && accountId);
		await deployContainers(config, normalisedContainerConfig, {
			versionId,
			accountId,
			scriptName,
			dryRun: props.dryRun ?? false,
		});
	}

	// deploy triggers
	const targets = await triggersDeploy({
		...props,
		routes: allDeploymentRoutes,
	});

	logger.log("Current Version ID:", versionId);

	return {
		sourceMapSize,
		versionId,
		workerTag,
		targets: targets ?? [],
	};
}

function deployWfpUserWorker(
	dispatchNamespace: string,
	versionId: string | null
) {
	// Will go under the "Uploaded" text
	logger.log("  Dispatch Namespace:", dispatchNamespace);
	logger.log("Current Version ID:", versionId);
}

export function formatTime(duration: number) {
	return `(${(duration / 1000).toFixed(2)} sec)`;
}

/**
 * Associate the newly deployed Worker with the given routes.
 */
export async function publishRoutes(
	complianceConfig: ComplianceConfig,
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
		return await fetchResult(complianceConfig, `${workerUrl}/routes`, {
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
			return await publishRoutesFallback(complianceConfig, routes, {
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
	complianceConfig: ComplianceConfig,
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
				"Either turn off service environments by setting `legacy_env = true`, creating an API token with 'All Zones' permissions, or logging in via OAuth",
			{ telemetryMessage: true }
		);
	}
	logger.warn(
		"The current authentication token does not have 'All Zones' permissions.\n" +
			"Falling back to using the zone-based API endpoint to update each route individually.\n" +
			"Note that there is no access to routes associated with zones that the API token does not have permission for.\n" +
			"Existing routes for this Worker in such zones will not be deleted."
	);

	const deployedRoutes: string[] = [];

	const queue = new PQueue({ concurrency: 10 });
	const queuePromises: Array<Promise<void>> = [];
	const zoneIdCache = new Map();

	// Collect the routes (and their zones) that will be deployed.
	const activeZones = new Map<string, string>();
	const routesToDeploy = new Map<string, string>();
	for (const route of routes) {
		queuePromises.push(
			queue.add(async () => {
				const zone = await getZoneForRoute(
					complianceConfig,
					{ route, accountId },
					zoneIdCache
				);
				if (zone) {
					activeZones.set(zone.id, zone.host);
					routesToDeploy.set(
						typeof route === "string" ? route : route.pattern,
						zone.id
					);
				}
			})
		);
	}
	await Promise.all(queuePromises.splice(0, queuePromises.length));

	// Collect the routes that are already deployed.
	const allRoutes = new Map<string, string>();
	const alreadyDeployedRoutes = new Set<string>();
	for (const [zone, host] of activeZones) {
		queuePromises.push(
			queue.add(async () => {
				try {
					for (const { pattern, script } of await fetchListResult<{
						pattern: string;
						script: string;
					}>(complianceConfig, `/zones/${zone}/workers/routes`)) {
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
			})
		);
	}
	// using Promise.all() here instead of queue.onIdle() to ensure
	// we actually throw errors that occur within queued promises.
	await Promise.all(queuePromises);

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
					`The route with pattern "${routePattern}" is already associated with another worker called "${knownScript}".`,
					{ telemetryMessage: "route already associated with another worker" }
				);
			}
		}

		const { pattern } = await fetchResult<{ pattern: string }>(
			complianceConfig,
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
					"Script name is required to update queue consumers",
					{ telemetryMessage: true }
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

function getDeployConfirmFunction(
	strictMode = false
): (text: string) => Promise<boolean> {
	const nonInteractive = isNonInteractiveOrCI();

	if (nonInteractive && strictMode) {
		return () => {
			logger.error(
				"Aborting the deployment operation (due to strict mode, to prevent this failure either remove the `--strict` flag or add the `--force` one)"
			);
			process.exitCode = 1;
			return Promise.resolve(false);
		};
	}

	return genericConfirm;
}
