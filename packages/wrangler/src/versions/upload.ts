import assert from "node:assert";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { blue, gray } from "@cloudflare/cli-shared-helpers/colors";
import { getWorkersDevSubdomain } from "@cloudflare/deploy-helpers";
import {
	configFileName,
	getTodaysCompatDate,
	formatConfigSnippet,
	getWorkersCIBranchName,
	ParseError,
	UserError,
	formatTime,
} from "@cloudflare/workers-utils";
import { Response } from "undici";
import { syncAssets } from "../assets";
import { fetchResult } from "../cfetch";
import { createCommand } from "../core/create-command";
import { createDeployHelpersContext } from "../core/deploy-helpers-context";
import { getBindings, provisionBindings } from "../deployment-bundle/bindings";
import { printBundleSize } from "../deployment-bundle/bundle-reporter";
import { createWorkerUploadForm } from "../deployment-bundle/create-worker-upload-form";
import {
	sharedDeployVersionsArgs,
	validateDeployVersionsArgs,
} from "../deployment-bundle/deploy-args";
import { handleBuild } from "../deployment-bundle/maybe-build-worker";
import {
	cleanupDestination,
	mergeVersionsUploadConfigArgs,
} from "../deployment-bundle/merge-config-args";
import { validateNodeCompatMode } from "../deployment-bundle/node-compat";
import {
	addRequiredSecretsInheritBindings,
	handleMissingSecretsError,
} from "../deployment-bundle/secrets-validation";
import { loadSourceMaps } from "../deployment-bundle/source-maps";
import { confirm } from "../dialogs";
import { getMigrationsToUpload } from "../durable";
import {
	applyServiceAndEnvironmentTags,
	tagsAreEqual,
	warnOnErrorUpdatingServiceAndEnvironmentTags,
} from "../environments";
import { logger } from "../logger";
import { verifyWorkerMatchesCITag } from "../match-tag";
import * as metrics from "../metrics";
import { writeOutput } from "../output";
import { ensureQueuesExistByConfig } from "../queues/client";
import { parseBulkInputToObject } from "../secret";
import {
	getSourceMappedString,
	maybeRetrieveFileSourceMap,
} from "../sourcemap";
import { helpIfErrorIsSizeOrScriptStartup } from "../utils/friendly-validator-errors";
import { getScriptName } from "../utils/getScriptName";
import { parseConfigPlacement } from "../utils/placement";
import { printBindings } from "../utils/print-bindings";
import { retryOnAPIFailure } from "../utils/retry";
import { useServiceEnvironments as useServiceEnvironmentsConfig } from "../utils/useServiceEnvironments";
import { isWorkerNotFoundError } from "../utils/worker-not-found-error";
import { patchNonVersionedScriptSettings } from "./api";
import type { RetrieveSourceMapFunction } from "../sourcemap";
import type {
	HandleBuild,
	VersionsUploadProps,
} from "@cloudflare/deploy-helpers";
import type { CfWorkerInit, Config } from "@cloudflare/workers-utils";
import type { FormData } from "undici";

export const versionsUploadCommand = createCommand({
	metadata: {
		description: "Uploads your Worker code and config as a new Version",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	positionalArgs: ["path"],
	args: {
		...sharedDeployVersionsArgs,
		"preview-alias": {
			describe: "Name of an alias for this Worker version",
			type: "string",
			requiresArg: true,
		},
	},
	behaviour: {
		useConfigRedirectIfAvailable: true,
		overrideExperimentalFlags: (args) => ({
			MULTIWORKER: false,
			RESOURCES_PROVISION: args.experimentalProvision ?? false,
			AUTOCREATE_RESOURCES: args.experimentalAutoCreate,
		}),
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
	},
	validateArgs(args) {
		validateDeployVersionsArgs(args, "versions upload");
	},
	handler: async function versionsUploadHandler(args, { config }) {
		// Merge CLI args with config (includes Sites validation and assets validation)
		const mergedProps = await mergeVersionsUploadConfigArgs(args, config);

		try {
			metrics.sendMetricsEvent(
				"upload worker version",
				{
					usesTypeScript: /\.tsx?$/.test(mergedProps.entry.file),
				},
				{
					sendMetrics: config.send_metrics,
				}
			);

			// Derive workerNameOverridden by comparing pre-merge name with post-merge name
			const preMergeName = getScriptName(args, config);
			const workerNameOverridden =
				mergedProps.name !== undefined && mergedProps.name !== preMergeName;

			const {
				versionId,
				workerTag,
				versionPreviewUrl,
				versionPreviewAliasUrl,
			} = await versionsUpload(mergedProps, config, handleBuild);

			writeOutput({
				type: "version-upload",
				version: 1,
				worker_name: mergedProps.name ?? null,
				worker_tag: workerTag,
				version_id: versionId,
				preview_url: versionPreviewUrl,
				preview_alias_url: versionPreviewAliasUrl,
				wrangler_environment: args.env,
				worker_name_overridden: workerNameOverridden,
			});
		} finally {
			cleanupDestination(mergedProps.destination);
		}
	},
});

export type VersionsUploadArgs = (typeof versionsUploadCommand)["args"];

export default async function versionsUpload(
	props: VersionsUploadProps,
	config: Config,
	buildWorker: HandleBuild
): Promise<{
	versionId: string | null;
	workerTag: string | null;
	versionPreviewUrl?: string | undefined;
	versionPreviewAliasUrl?: string | undefined;
}> {
	if (!props.name) {
		throw new UserError(
			'You need to provide a name of your worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`',
			{ telemetryMessage: "versions upload missing worker name" }
		);
	}
	const {
		entry,
		name,
		compatibilityDate,
		compatibilityFlags,
		keepVars,
		minify,
		noBundle,
		uploadSourceMaps,
		accountId,
	} = props;

	if (!props.dryRun) {
		assert(accountId, "Missing account ID");
		await verifyWorkerMatchesCITag(config, accountId, name, config.configPath);
	}
	let versionId: string | null = null;
	let workerTag: string | null = null;
	let tags: string[] = []; // arbitrary metadata tags, not to be confused with script tag or annotations

	if (accountId && name) {
		try {
			const {
				default_environment: { script },
			} = await fetchResult<{
				default_environment: {
					script: {
						tag: string;
						tags: string[] | null;
						last_deployed_from: "dash" | "wrangler" | "api";
					};
				};
			}>(
				config,
				`/accounts/${accountId}/workers/services/${name}` // TODO(consider): should this be a /versions endpoint?
			);

			workerTag = script.tag;
			tags = script.tags ?? tags;

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
			if (!isWorkerNotFoundError(e)) {
				throw e;
			}
		}
	}

	if (!compatibilityDate) {
		const compatibilityDateStr = getTodaysCompatDate();

		throw new UserError(
			`A compatibility_date is required when uploading a Worker Version. Add the following to your ${configFileName(config.configPath)} file:
    \`\`\`
	${formatConfigSnippet({ compatibility_date: compatibilityDateStr }, config.configPath, false)}
    \`\`\`
    Or you could pass it in your terminal as \`--compatibility-date ${compatibilityDateStr}\`
See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information.`,
			{
				telemetryMessage: "versions upload missing compatibility date",
			}
		);
	}

	const nodejsCompatMode = validateNodeCompatMode(
		compatibilityDate,
		compatibilityFlags,
		{ noBundle }
	);

	// Warn if user tries minify or node-compat with no-bundle
	if (noBundle && minify) {
		logger.warn(
			"`--minify` and `--no-bundle` can't be used together. If you want to minify your Worker and disable Wrangler's bundling, please minify as part of your own bundling process."
		);
	}

	const scriptName = name;

	if (config.site && !config.site.bucket) {
		throw new UserError(
			"A [site] definition requires a `bucket` field with a path to the site's assets directory.",
			{ telemetryMessage: "versions upload sites missing bucket" }
		);
	}

	const start = Date.now();
	const workerName = scriptName;
	const workerUrl = `/accounts/${accountId}/workers/scripts/${scriptName}`;

	const { format } = entry;
	const projectRoot = entry.projectRoot;

	if (config.wasm_modules && format === "modules") {
		throw new UserError(
			"You cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code",
			{
				telemetryMessage:
					"versions upload wasm modules unsupported module worker",
			}
		);
	}

	if (config.text_blobs && format === "modules") {
		throw new UserError(
			`You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your ${configFileName(config.configPath)} file`,
			{
				telemetryMessage:
					"versions upload text blobs unsupported module worker",
			}
		);
	}

	if (config.data_blobs && format === "modules") {
		throw new UserError(
			`You cannot configure [data_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your ${configFileName(config.configPath)} file`,
			{
				telemetryMessage:
					"versions upload data blobs unsupported module worker",
			}
		);
	}

	let hasPreview = false;

	const {
		modules,
		dependencies,
		resolvedEntryPointPath,
		bundleType,
		content,
		bundle,
	} = await buildWorker.build(props, config, {
		nodejsCompatMode,
	});
	const bindings = getBindings(config);

	// Vars from the CLI (--var) are hidden so their values aren't logged to the terminal
	for (const [bindingName, value] of Object.entries(props.cliVars)) {
		bindings[bindingName] = {
			type: "plain_text",
			value,
			hidden: true,
		};
	}

	// durable object migrations
	const migrations = !props.dryRun
		? await getMigrationsToUpload(scriptName, {
				accountId,
				config,
				useServiceEnvironments: useServiceEnvironmentsConfig(config),
				env: props.env,
				dispatchNamespace: undefined,
			})
		: undefined;

	// Upload assets if assets is being used
	const assetsJwt =
		props.assetsOptions && !props.dryRun
			? await syncAssets(
					config,
					accountId,
					props.assetsOptions.directory,
					scriptName
				)
			: undefined;

	if (props.secretsFile) {
		const secretsResult = await parseBulkInputToObject(props.secretsFile);
		if (secretsResult) {
			for (const [secretName, secretValue] of Object.entries(
				secretsResult.content
			)) {
				bindings[secretName] = {
					type: "secret_text",
					value: secretValue,
				};
			}
		}
	}

	addRequiredSecretsInheritBindings(config, bindings, { type: "upload" });

	const placement = parseConfigPlacement(config);

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
		migrations,
		modules,
		containers: config.containers,
		sourceMaps: uploadSourceMaps
			? loadSourceMaps(main, modules, bundle)
			: undefined,
		compatibility_date: compatibilityDate,
		compatibility_flags: compatibilityFlags,
		keepVars,
		// we never delete secret bindings when uploading, even if we are setting secrets from a file
		// so inherit all unchanged secrets from the previous Worker Version
		keepSecrets: true,
		placement,
		tail_consumers: config.tail_consumers,
		limits: config.limits,
		annotations: {
			"workers/message": props.message,
			"workers/tag": props.tag,
			"workers/alias": props.previewAlias,
		},
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
		logpush: undefined, // logpush and observability are non-versioned settings
		observability: undefined,
		cache: config.cache, // cache is a versioned setting
	};

	if (config.containers && config.containers.length > 0) {
		logger.warn(
			`Your Worker has Containers configured. Container configuration changes (such as image, max_instances, etc.) will not be gradually rolled out with versions. These changes will only take effect after running \`wrangler deploy\`.`
		);
	}

	await printBundleSize(
		{ name: path.basename(resolvedEntryPointPath), content: content },
		modules
	);

	let workerBundle: FormData;

	if (props.dryRun) {
		workerBundle = createWorkerUploadForm(worker, bindings, {
			dryRun: true,
			unsafe: config.unsafe,
		});
		printBindings(
			bindings,
			config.tail_consumers,
			config.streaming_tail_consumers,
			undefined,
			{ unsafeMetadata: config.unsafe?.metadata }
		);
	} else {
		assert(accountId, "Missing accountId");
		if (props.resourcesProvision) {
			await provisionBindings(
				bindings,
				accountId,
				scriptName,
				props.experimentalAutoCreate,
				config
			);
		}
		workerBundle = createWorkerUploadForm(worker, bindings, {
			unsafe: config.unsafe,
		});

		await ensureQueuesExistByConfig(config);
		let bindingsPrinted = false;

		// Upload the version.
		try {
			const result = await retryOnAPIFailure(async () =>
				fetchResult<{
					id: string;
					startup_time_ms: number;
					metadata: {
						has_preview: boolean;
					};
				}>(
					config,
					`${workerUrl}/versions`,
					{
						method: "POST",
						body: workerBundle,
						headers: props.sendMetrics ? { metricsEnabled: "true" } : undefined,
					},
					new URLSearchParams({ bindings_inherit: "strict" })
				)
			);

			logger.log("Worker Startup Time:", result.startup_time_ms, "ms");
			bindingsPrinted = true;
			printBindings(
				bindings,
				config.tail_consumers,
				config.streaming_tail_consumers,
				undefined,
				{ unsafeMetadata: config.unsafe?.metadata }
			);
			versionId = result.id;
			hasPreview = result.metadata.has_preview;
		} catch (err) {
			if (!bindingsPrinted) {
				printBindings(
					bindings,
					config.tail_consumers,
					config.streaming_tail_consumers,
					undefined,
					{ unsafeMetadata: config.unsafe?.metadata }
				);
			}

			const message = await helpIfErrorIsSizeOrScriptStartup(
				err,
				dependencies,
				workerBundle,
				projectRoot
			);
			if (message) {
				logger.error(message);
			}

			handleMissingSecretsError(err, config, { type: "upload" });

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

		// Update service and environment tags when using environments

		const nextTags = applyServiceAndEnvironmentTags(config, tags);
		if (!tagsAreEqual(tags, nextTags)) {
			try {
				await patchNonVersionedScriptSettings(config, accountId, scriptName, {
					tags: nextTags,
				});
			} catch {
				warnOnErrorUpdatingServiceAndEnvironmentTags();
			}
		}
	}
	if (props.outfile) {
		// we're using a custom output file,
		// so let's first ensure it's parent directory exists
		mkdirSync(path.dirname(props.outfile), { recursive: true });

		const serializedFormData = await new Response(workerBundle).arrayBuffer();

		writeFileSync(props.outfile, Buffer.from(serializedFormData));
	}

	if (props.dryRun) {
		logger.log(`--dry-run: exiting now.`);
		return { versionId, workerTag };
	}
	if (!accountId) {
		throw new UserError("Missing accountId", {
			telemetryMessage: "versions upload missing account id",
		});
	}

	const uploadMs = Date.now() - start;

	logger.log("Uploaded", workerName, formatTime(uploadMs));
	logger.log("Worker Version ID:", versionId);

	let versionPreviewUrl: string | undefined = undefined;
	let versionPreviewAliasUrl: string | undefined = undefined;

	if (versionId && hasPreview) {
		const { previews_enabled: previews_available_on_subdomain } =
			await fetchResult<{
				previews_enabled: boolean;
			}>(config, `${workerUrl}/subdomain`);

		if (previews_available_on_subdomain) {
			const userSubdomain = await getWorkersDevSubdomain(
				config,
				accountId,
				createDeployHelpersContext(),
				{
					configPath: config.configPath,
				}
			);
			const shortVersion = versionId.slice(0, 8);
			versionPreviewUrl = `https://${shortVersion}-${workerName}.${userSubdomain}`;
			logger.log(`Version Preview URL: ${versionPreviewUrl}`);

			if (props.previewAlias) {
				versionPreviewAliasUrl = `https://${props.previewAlias}-${workerName}.${userSubdomain}`;
				logger.log(`Version Preview Alias URL: ${versionPreviewAliasUrl}`);
			}
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

	return { versionId, workerTag, versionPreviewUrl, versionPreviewAliasUrl };
}

// Constants for DNS label constraints and hash configuration
const MAX_DNS_LABEL_LENGTH = 63;
const HASH_LENGTH = 4;
const ALIAS_VALIDATION_REGEX = /^[a-z](?:[a-z0-9-]*[a-z0-9])?$/i;

/**
 * Sanitizes a branch name to create a valid DNS label alias.
 * Converts to lowercase, replaces invalid chars with dashes, removes consecutive dashes.
 */
function sanitizeBranchName(branchName: string): string {
	return branchName
		.replace(/[^a-zA-Z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "")
		.toLowerCase();
}

/**
 * Gets the current branch name from CI environment or git.
 */
function getBranchName(): string | undefined {
	// Try CI environment variable first
	const ciBranchName = getWorkersCIBranchName();
	if (ciBranchName) {
		return ciBranchName;
	}

	// Fall back to git commands
	try {
		execSync(`git rev-parse --is-inside-work-tree`, { stdio: "ignore" });
		return execSync(`git rev-parse --abbrev-ref HEAD`).toString().trim();
	} catch {
		return undefined;
	}
}

/**
 * Creates a truncated alias with hash suffix when the branch name is too long.
 * Hash from original branch name to preserve uniqueness.
 */
function createTruncatedAlias(
	branchName: string,
	sanitizedAlias: string,
	availableSpace: number
): string | undefined {
	const spaceForHash = HASH_LENGTH + 1; // +1 for hyphen separator
	const maxPrefixLength = availableSpace - spaceForHash;

	if (maxPrefixLength < 1) {
		// Not enough space even with truncation
		return undefined;
	}

	const hash = createHash("sha256")
		.update(branchName)
		.digest("hex")
		.slice(0, HASH_LENGTH);

	const truncatedPrefix = sanitizedAlias.slice(0, maxPrefixLength);
	return `${truncatedPrefix}-${hash}`;
}

/**
 * Generates a preview alias based on the current git branch.
 * Alias must be <= 63 characters, alphanumeric + dashes only, and start with a letter.
 * Returns undefined if not in a git directory or requirements cannot be met.
 */
export function generatePreviewAlias(scriptName: string): string | undefined {
	const warnAndExit = () => {
		logger.warn(
			`Preview alias generation requested, but could not be autogenerated.`
		);
		return undefined;
	};

	const branchName = getBranchName();
	if (!branchName) {
		return warnAndExit();
	}

	const sanitizedAlias = sanitizeBranchName(branchName);

	// Validate the sanitized alias meets DNS label requirements
	if (!ALIAS_VALIDATION_REGEX.test(sanitizedAlias)) {
		return warnAndExit();
	}

	const availableSpace = MAX_DNS_LABEL_LENGTH - scriptName.length - 1;

	// If the sanitized alias fits within the remaining space, return it,
	// otherwise otherwise try truncation with hash suffixed
	if (sanitizedAlias.length <= availableSpace) {
		return sanitizedAlias;
	}

	const truncatedAlias = createTruncatedAlias(
		branchName,
		sanitizedAlias,
		availableSpace
	);

	return truncatedAlias || warnAndExit();
}
