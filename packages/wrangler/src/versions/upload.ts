import assert from "node:assert";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { blue, gray } from "@cloudflare/cli-shared-helpers/colors";
import { getWorkersCIBranchName } from "@cloudflare/workers-utils";
import { Response, type FormData } from "undici";
import { syncAssets } from "../assets";
import { fetchResult } from "../cfetch";
import { createCommand } from "../core/create-command";
import { formatTime } from "../deploy/helpers";
import { getBindings, provisionBindings } from "../deployment-bundle/bindings";
import { buildWorker } from "../deployment-bundle/build-worker";
import { createWorkerUploadForm } from "../deployment-bundle/create-worker-upload-form";
import { sharedDeployVersionsArgs } from "../deployment-bundle/deploy-args";
import { runAuthedValidation } from "../deployment-bundle/pre-deploy-validation";
import {
	resolveVersionsUploadInput,
	validateDeployVersionsArgs,
	type VersionsUploadProps,
} from "../deployment-bundle/resolve-input";
import {
	createCfWorkerInit,
	uploadViaVersionsApi,
} from "../deployment-bundle/upload";
import { getMigrationsToUpload } from "../durable";
import { getFlag } from "../experimental-flags";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { writeOutput } from "../output";
import { getWorkersDevSubdomain } from "../routes";
import { requireAuth } from "../user";
import { printBindings } from "../utils/print-bindings";
import { useServiceEnvironments } from "../utils/useServiceEnvironments";
import type { Config } from "@cloudflare/workers-utils";

export const versionsUploadCommand = createCommand({
	metadata: {
		description: "Uploads your Worker code and config as a new Version",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	positionalArgs: ["script"],
	args: {
		...sharedDeployVersionsArgs,
		"preview-alias": {
			describe: "Name of an alias for this Worker version",
			type: "string",
			requiresArg: true,
		},
		"keep-vars": {
			describe:
				"When not used (or set to false), Wrangler will delete all vars before setting those found in the Wrangler configuration.\n" +
				"When used (and set to true), the environment variables are not deleted before the deployment.\n" +
				"If you set variables via the dashboard you probably want to use this flag.\n" +
				"Note that secrets are never deleted by deployments.",
			default: false,
			type: "boolean",
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
		validateDeployVersionsArgs(args);
	},
	handler: async function versionsUploadHandler(args, { config }) {
		const props = await resolveVersionsUploadInput(args, config);
		const result = await executeVersionsUpload(props, config);

		metrics.sendMetricsEvent(
			"upload worker version",
			{
				usesTypeScript: /\.tsx?$/.test(props.entry.file),
			},
			{
				sendMetrics: config.send_metrics,
			}
		);

		writeOutput({
			type: "version-upload",
			version: 1,
			worker_name: props.name ?? null,
			worker_tag: result.workerTag,
			version_id: result.versionId,
			preview_url: result.previewUrl,
			preview_alias_url: result.previewAliasUrl,
			wrangler_environment: props.env,
			worker_name_overridden: props.workerNameOverridden,
		});
	},
});

type VersionsUploadResult = {
	versionId: string | null;
	workerTag: string | null;
	previewUrl?: string;
	previewAliasUrl?: string;
};

async function executeVersionsUpload(
	props: VersionsUploadProps,
	config: Config
): Promise<VersionsUploadResult> {
	const accountId = props.dryRun ? undefined : await requireAuth(config);

	let versionId: string | null = null;
	let workerTag: string | null = null;
	let tags: string[] = [];

	// Pre-deploy validation (read-only checks + user confirmations)
	if (!props.dryRun) {
		assert(accountId, "Missing account ID");

		const validationResult = await runAuthedValidation({
			...props,
			accountId,
		});

		if (validationResult.aborted) {
			return {
				versionId,
				workerTag: validationResult.workerTag,
			};
		}

		workerTag = validationResult.workerTag;
		tags = validationResult.tags;
	}

	const workerUrl = `/accounts/${accountId}/workers/scripts/${props.name}`;

	const start = Date.now();
	let hasPreview = false;

	try {
		const buildResult = await buildWorker(props, config);

		const bindings = await getBindings(config, props);

		const migrations = !props.dryRun
			? await getMigrationsToUpload(props.name, {
					accountId,
					config,
					useServiceEnvironments: useServiceEnvironments(config),
					env: props.env,
					dispatchNamespace: undefined,
				})
			: undefined;

		const assetsJwt =
			props.assetsOptions && !props.dryRun
				? await syncAssets(
						config,
						accountId,
						props.assetsOptions.directory,
						props.name
					)
				: undefined;

		const worker = createCfWorkerInit(props, config, buildResult, {
			migrations,
			assetsJwt,
		});

		let workerBundle: FormData;

		if (props.dryRun) {
			workerBundle = createWorkerUploadForm(worker, bindings, {
				dryRun: true,
				unsafe: config.unsafe,
			});
		} else {
			assert(accountId, "Missing accountId");
			if (getFlag("RESOURCES_PROVISION")) {
				await provisionBindings(
					bindings,
					accountId,
					props.name,
					props.experimentalAutoCreate,
					config
				);
			}
			workerBundle = createWorkerUploadForm(worker, bindings, {
				unsafe: config.unsafe,
			});

			const uploadResult = await uploadViaVersionsApi(
				props,
				config,
				accountId,
				workerBundle,
				tags,
				worker,
				buildResult
			);

			versionId = uploadResult.versionId;
			hasPreview = uploadResult.hasPreview ?? false;
		}
		printBindings(
			bindings,
			config.tail_consumers,
			config.streaming_tail_consumers,
			undefined,
			{ unsafeMetadata: config.unsafe?.metadata }
		);
		if (props.outfile) {
			mkdirSync(path.dirname(props.outfile), { recursive: true });
			const serializedFormData = await new Response(workerBundle).arrayBuffer();
			writeFileSync(props.outfile, Buffer.from(serializedFormData));
		}
	} finally {
		if (typeof props.destination !== "string") {
			props.destination.remove();
		}
	}

	if (props.dryRun) {
		logger.log(`--dry-run: exiting now.`);
		return { versionId, workerTag };
	}

	assert(accountId, "Missing account ID");
	const uploadMs = Date.now() - start;

	logger.log("Uploaded", props.name, formatTime(uploadMs));
	logger.log("Worker Version ID:", versionId);

	let previewUrl: string | undefined;
	let previewAliasUrl: string | undefined;

	if (versionId && hasPreview) {
		const { previews_enabled: previews_available_on_subdomain } =
			await fetchResult<{
				previews_enabled: boolean;
			}>(config, `${workerUrl}/subdomain`);

		if (previews_available_on_subdomain) {
			const userSubdomain = await getWorkersDevSubdomain(
				config,
				accountId,
				config.configPath
			);
			const shortVersion = versionId.slice(0, 8);
			previewUrl = `https://${shortVersion}-${props.name}.${userSubdomain}`;
			logger.log(`Version Preview URL: ${previewUrl}`);

			if (props.previewAlias) {
				previewAliasUrl = `https://${props.previewAlias}-${props.name}.${userSubdomain}`;
				logger.log(`Version Preview Alias URL: ${previewAliasUrl}`);
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

	return { versionId, workerTag, previewUrl, previewAliasUrl };
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
