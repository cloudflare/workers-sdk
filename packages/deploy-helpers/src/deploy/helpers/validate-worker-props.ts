import assert from "node:assert";
import {
	configFileName,
	experimental_patchConfig,
	formatConfigSnippet,
	getTodaysCompatDate,
	UserError,
} from "@cloudflare/workers-utils";
import { confirm, fetchResult, logger } from "../../shared/context";
import { ensureQueuesExistByConfig } from "../../triggers/queue-consumers";
import { checkRemoteSecretsOverride } from "./check-remote-secrets-override";
import { checkWorkflowConflicts } from "./check-workflow-conflicts";
import { getConfigPatch, getRemoteConfigDiff } from "./config-diffs";
import { getDeployConfirmFunction } from "./deploy-confirm";
import { downloadWorkerConfig } from "./download-worker-config";
import { verifyWorkerMatchesCITag } from "./match-tag";
import { validateRoutes } from "./validate-routes";
import { isWorkerNotFoundError } from "./worker-not-found-error";
import type { DeployProps, VersionsUploadProps } from "../../shared/types";
import type {
	AssetsOptions,
	Config,
	RawConfig,
} from "@cloudflare/workers-utils";

/**
 *
 * Any validation of props (merged args and config) that does not require API calls
 * should go here, and NOT inline in deploy() or versionsUpload()
 *
 * The order should be:
 * 1. generic validation checks
 * 2. deploy or versions upload specific checks
 */
export async function validateWorkerProps(
	props:
		| (DeployProps & { assetsOptions?: AssetsOptions })
		| VersionsUploadProps,
	config: Config
): Promise<void> {
	const { name, compatibilityDate } = props;
	const { format } = props.entry;
	if (!name) {
		throw new UserError(
			`You need to provide the name of your worker. Either pass it as a cli arg with --name <name> or in your config file as ${formatConfigSnippet({ name: "<name>" }, config.userConfigPath)}`,
			{
				telemetryMessage:
					props.command === "deploy"
						? "deploy command missing worker name"
						: "versions upload missing worker name",
			}
		);
	}

	if (!compatibilityDate) {
		const compatibilityDateStr = getTodaysCompatDate();
		throw new UserError(
			`A compatibility_date is required when uploading a Worker. Add the following to your ${configFileName(config.configPath)} file:
    \`\`\`
    ${formatConfigSnippet({ compatibility_date: compatibilityDateStr }, config.configPath, false)}
    \`\`\`
    Or you could pass it in your terminal as \`--compatibility-date ${compatibilityDateStr}\`
See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information.`,
			{
				telemetryMessage:
					props.command === "deploy"
						? "missing compatibility date when deploying"
						: "versions upload missing compatibility date",
			}
		);
	}

	if (config.wasm_modules && format === "modules") {
		throw new UserError(
			"You cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code",
			{ telemetryMessage: "wasm_modules with es module worker" }
		);
	}

	if (config.text_blobs && format === "modules") {
		throw new UserError(
			`You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your ${configFileName(config.configPath)} file`,
			{ telemetryMessage: "text_blobs with es module worker" }
		);
	}

	if (config.data_blobs && format === "modules") {
		throw new UserError(
			`You cannot configure [data_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your ${configFileName(config.configPath)} file`,
			{ telemetryMessage: "data_blobs with es module worker" }
		);
	}

	if (props.command === "deploy") {
		validateRoutes(props.routes, props.assetsOptions);
		assert(
			!config.site || config.site.bucket,
			"A [site] definition requires a `bucket` field with a path to the site's assets directory."
		);
		if (
			!props.isWorkersSite &&
			Boolean(props.legacyAssetPaths) &&
			format === "service-worker"
		) {
			throw new UserError(
				"You cannot use the service-worker format with an `assets` directory yet. For information on how to migrate to the module-worker format, see: https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/",
				{ telemetryMessage: "deploy service worker assets unsupported" }
			);
		}
	} else {
		if (config.containers && config.containers.length > 0) {
			logger.warn(
				`Your Worker has Containers configured. Container configuration changes (such as image, max_instances, etc.) will not be gradually rolled out with versions. These changes will only take effect after running \`deploy\`.`
			);
		}
	}
}

export type PreUploadApiChecksResult = {
	workerTag: string | null;
	tags: string[];
	workerExists: boolean;
	aborted: boolean;
};

/**
 *
 * Any validation that requires API calls should go here.
 * This is skipped on dry runs (for now)
 */
export async function preUploadApiChecks(
	props: DeployProps | VersionsUploadProps,
	config: Config
): Promise<PreUploadApiChecksResult> {
	const { accountId, name } = props;

	if (props.dryRun || !accountId || !name) {
		return {
			workerTag: null,
			tags: [],
			workerExists: true,
			aborted: false,
		};
	}

	await verifyWorkerMatchesCITag(config, accountId, name, config.configPath);

	const deployConfirm = getDeployConfirmFunction({
		strictMode: props.strict,
	});

	// TODO: warn if git/hg has uncommitted changes
	let workerTag: string | null = null;
	let tags: string[] = []; // arbitrary metadata tags, not to be confused with script tag or annotations
	let workerExists = true;

	// Skip the service metadata fetch for dispatch namespace deploys (Workers for Platforms).
	// Dispatch namespace scripts don't have standard service metadata.
	const skipMetadataFetch =
		props.command === "deploy" && !!props.dispatchNamespace;

	if (!skipMetadataFetch) {
		try {
			const serviceMetaData = await fetchResult<{
				default_environment: {
					environment: string;
					script: {
						tag: string;
						tags: string[] | null;
						last_deployed_from: "dash" | "api";
					};
				};
			}>(config, `/accounts/${accountId}/workers/services/${name}`);
			const {
				default_environment: { script },
			} = serviceMetaData;
			workerTag = script.tag;
			tags = script.tags ?? tags;

			if (script.last_deployed_from === "dash") {
				const remoteWorkerConfig = await downloadWorkerConfig(
					name,
					serviceMetaData.default_environment.environment,
					props.entry.file,
					accountId
				);

				const configForDiff =
					props.command === "deploy"
						? {
								...config,
								// We also want to include all the routes used for deployment
								routes: props.routes,
							}
						: config;

				const configDiff = getRemoteConfigDiff(
					remoteWorkerConfig,
					configForDiff
				);

				// If there are only additive changes (or no changes at all) there should be no problem,
				// just using the local config (and override the remote one) should be totally fine
				if (!configDiff.nonDestructive) {
					logger.warn(
						"The local configuration being used (generated from your local configuration file) differs from the remote configuration of your Worker set via the Cloudflare Dashboard:" +
							`\n${configDiff.diff}\n\n` +
							"Uploading the Worker will override the remote configuration with your local one."
					);
					if (!(await deployConfirm("Would you like to continue?"))) {
						if (
							config.userConfigPath &&
							/\.jsonc?$/.test(config.userConfigPath)
						) {
							if (
								await confirm(
									"Would you like to update the local config file with the remote values?",
									{
										defaultValue: true,
										fallbackValue: true,
									}
								)
							) {
								const patchObj: RawConfig = getConfigPatch(
									configDiff.diff,
									props.env
								);

								experimental_patchConfig(
									config.userConfigPath,
									patchObj,
									false
								);
							}
						}

						return { workerTag, tags, workerExists, aborted: true };
					}
				}
			} else if (
				script.last_deployed_from === "api" &&
				!props.skipLastDeployedFromApiCheck
			) {
				logger.warn(
					`You are about to upload a Worker that was last updated via the script API.\nEdits that have been made via the script API will be overridden by your local code and config.`
				);
				if (!(await deployConfirm("Would you like to continue?"))) {
					return { workerTag, tags, workerExists, aborted: true };
				}
			}
		} catch (e) {
			if (isWorkerNotFoundError(e)) {
				if (props.command === "versions upload") {
					throw new UserError(
						"You cannot upload a new version of a Worker that does not yet exist. Please use run the `deploy` command first.",
						{ telemetryMessage: "versions upload worker not found" }
					);
				}
				workerExists = false;
			} else {
				throw e;
			}
		}
	}

	const remoteSecretsCheck = await checkRemoteSecretsOverride(
		config,
		accountId,
		props.env
	);

	if (remoteSecretsCheck?.override) {
		logger.warn(remoteSecretsCheck.deployErrorMessage);
		if (!(await deployConfirm("Would you like to continue?"))) {
			return { workerTag, tags, workerExists, aborted: true };
		}
	}

	if (config.workflows?.length) {
		const workflowCheck = await checkWorkflowConflicts(config, accountId, name);

		if (workflowCheck.hasConflicts) {
			logger.warn(workflowCheck.message);
			if (!(await deployConfirm("Do you want to continue?"))) {
				return { workerTag, tags, workerExists, aborted: true };
			}
		}
	}

	await ensureQueuesExistByConfig(config, accountId);
	return { workerTag, tags, workerExists, aborted: false };
}
