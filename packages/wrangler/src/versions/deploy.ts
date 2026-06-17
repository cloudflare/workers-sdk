import assert from "node:assert";
import * as cli from "@cloudflare/cli-shared-helpers";
import { brandColor, gray, white } from "@cloudflare/cli-shared-helpers/colors";
import {
	grayBar,
	inputPrompt,
	leftT,
	spinnerWhile,
} from "@cloudflare/cli-shared-helpers/interactive";
import { type ApiVersion, printVersions } from "@cloudflare/deploy-helpers";
import { UserError } from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import { createCommand } from "../core/create-command";
import { experimentalNewConfigArg } from "../experimental-config/cli-flag";
import * as metrics from "../metrics";
import { writeOutput } from "../output";
import { requireAuth } from "../user";
import formatLabelledValues from "../utils/render-labelled-values";
import {
	createDeployment,
	fetchDeployableVersions,
	fetchDeploymentVersions,
	fetchLatestDeployment,
	fetchVersions,
	patchNonVersionedScriptSettings,
} from "./api";
import type { Percentage, VersionCache, VersionId } from "./types";
import type { ComplianceConfig, Config } from "@cloudflare/workers-utils";

const EPSILON = 0.001; // used to avoid floating-point errors. Comparions to a value +/- EPSILON will mean "roughly equals the value".
const BLANK_INPUT = "-"; // To be used where optional user-input is displayed and the value is nullish
const ZERO_WIDTH_SPACE = "\u200B"; // Some log lines get trimmed and so, to indent, the line is prefixed with a zero-width space

type OptionalPercentage = number | null; // null means automatically assign (evenly distribute remaining traffic)

export const versionsDeployCommand = createCommand({
	metadata: {
		description:
			"Safely roll out new Versions of your Worker by splitting traffic between multiple Versions",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		supportTemporary: true,
		useConfigRedirectIfAvailable: true,
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
		suggestSkillsAfterHandler: true,
	},

	args: {
		...experimentalNewConfigArg,
		name: {
			describe: "Name of the worker",
			type: "string",
			requiresArg: true,
		},
		"version-id": {
			describe: "Worker Version ID(s) to deploy",
			type: "string",
			array: true,
			requiresArg: true,
		},
		percentage: {
			describe:
				"Percentage of traffic to split between Worker Version(s) (0-100)",
			array: true,
			type: "number",
			requiresArg: true,
		},
		"version-specs": {
			describe:
				"Shorthand notation to deploy Worker Version(s) [<version-id>@<percentage>..]. Omitted percentages share the remaining traffic.",
			type: "string",
			array: true,
		},
		"version-tag": {
			describe:
				"Worker Version tag(s) to deploy, resolved to a Version ID against the deployable versions. Supports the shorthand notation [<version-tag>@<percentage>..].",
			type: "string",
			array: true,
			requiresArg: true,
		},
		message: {
			describe: "Description of this deployment (optional)",
			type: "string",
			requiresArg: true,
		},
		yes: {
			alias: "y",
			describe: "Automatically accept defaults to prompts",
			type: "boolean",
			default: false,
		},
		"dry-run": {
			describe: "Don't actually deploy",
			type: "boolean",
			default: false,
		},
		"max-versions": {
			hidden: true, // experimental, not supported long-term
			describe: "Maximum allowed versions to select",
			type: "number",
			default: 2, // (when server-side limitation is lifted, we can update this default or just remove the option entirely)
		},
	},
	positionalArgs: ["version-specs"],
	handler: async function versionsDeployHandler(args, { config }) {
		metrics.sendMetricsEvent("deploy worker versions", {
			sendMetrics: config.send_metrics,
		});

		const accountId = await requireAuth(config);
		const workerName = args.name ?? config.name;

		if (workerName === undefined) {
			throw new UserError(
				'You need to provide a name of your worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`',
				{ telemetryMessage: "versions deploy missing worker name" }
			);
		}

		const versionCache: VersionCache = new Map();
		const optionalVersionTraffic = parseVersionSpecs(args);
		const tagTraffic = parseTagSpecs(args);
		const acceptPromptDefaults =
			args.yes || optionalVersionTraffic.size + tagTraffic.size > 0;

		cli.startSection(
			"Deploy Worker Versions",
			"by splitting traffic between multiple versions",
			true
		);

		await printLatestDeployment(config, accountId, workerName, versionCache);

		// Resolve any --version-tag args to their Version IDs against the
		// deployable versions, then merge them into the version traffic to deploy.
		if (tagTraffic.size > 0) {
			const resolvedTagTraffic = await resolveTagsToVersions(
				config,
				accountId,
				workerName,
				tagTraffic,
				versionCache
			);
			for (const [versionId, percentage] of resolvedTagTraffic) {
				optionalVersionTraffic.set(versionId, percentage);
			}
		}

		// prompt to confirm or change the versionIds from the args
		const confirmedVersionsToDeploy = await promptVersionsToDeploy(
			config,
			accountId,
			workerName,
			[...optionalVersionTraffic.keys()],
			versionCache,
			acceptPromptDefaults
		);

		// validate we have at least 1 version
		if (confirmedVersionsToDeploy.length === 0) {
			throw new UserError("You must select at least 1 version to deploy.", {
				telemetryMessage: "versions deploy missing selected versions",
			});
		}

		// validate we have at most experimentalMaxVersions (default: 2)
		if (confirmedVersionsToDeploy.length > args.maxVersions) {
			throw new UserError(
				`You must select at most ${args.maxVersions} versions to deploy.`,
				{ telemetryMessage: "versions deploy too many selected versions" }
			);
		}

		// prompt to confirm or change the percentages for each confirmed version to deploy
		const confirmedVersionTraffic = await promptPercentages(
			confirmedVersionsToDeploy,
			optionalVersionTraffic,
			acceptPromptDefaults
		);

		// prompt for deployment message
		const message = await inputPrompt<string | undefined>({
			type: "text",
			label: "Deployment message",
			defaultValue: args.message,
			acceptDefault: acceptPromptDefaults,
			question: "Add a deployment message",
			helpText: "(optional)",
		});

		if (args.dryRun) {
			cli.cancel("--dry-run: exiting");
			return;
		}

		const start = Date.now();

		const { id: deploymentId } = await spinnerWhile({
			startMessage: `Deploying ${confirmedVersionsToDeploy.length} version(s)`,
			promise() {
				return createDeployment(
					config,
					accountId,
					workerName,
					confirmedVersionTraffic,
					message
				);
			},
		});

		await maybePatchSettings(config, accountId, workerName);

		const elapsedMilliseconds = Date.now() - start;
		const elapsedSeconds = elapsedMilliseconds / 1000;
		const elapsedString = `${elapsedSeconds.toFixed(2)} sec`;

		const trafficSummaryList = Array.from(confirmedVersionTraffic).map(
			([versionId, percentage]) => `version ${versionId} at ${percentage}%`
		);
		const trafficSummaryString = new Intl.ListFormat("en-US").format(
			trafficSummaryList
		);

		cli.success(
			`Deployed ${workerName} ${trafficSummaryString} (${elapsedString})`
		);

		let workerTag: string | null = null;
		try {
			const serviceMetaData = await fetchResult<{
				default_environment: { script: { tag: string } };
			}>(config, `/accounts/${accountId}/workers/services/${workerName}`);
			workerTag = serviceMetaData.default_environment.script.tag;
		} catch {
			// If the fetch fails then we just output a null for the workerTag.
		}
		writeOutput({
			type: "version-deploy",
			version: 1,
			worker_name: workerName,
			worker_tag: workerTag,
			// NOTE this deploymentId is related to the gradual rollout of the versions given in the version_traffic.
			deployment_id: deploymentId,
			version_traffic: confirmedVersionTraffic,
		});
	},
});

export {
	confirmLatestDeploymentOverwrite,
	printVersions,
} from "@cloudflare/deploy-helpers";

export async function printLatestDeployment(
	config: Config,
	accountId: string,
	workerName: string,
	versionCache: VersionCache
) {
	const latestDeployment = await spinnerWhile({
		startMessage: "Fetching latest deployment",
		async promise() {
			return fetchLatestDeployment(config, accountId, workerName);
		},
	});
	const [versions, traffic] = await fetchDeploymentVersions(
		config,
		accountId,
		workerName,
		latestDeployment,
		versionCache
	);
	cli.logRaw(
		`${leftT} Your current deployment has ${versions.length} version(s):`
	);
	printVersions(versions, traffic);
}

/**
 * Prompts the user to select which versions they want to deploy.
 * The list of possible versions will include:
 * - versions within the latest deployment
 * - the latest 10 uploaded versions
 * - the versions the user provided as args (if any)
 *
 * sorted by upload date (latest first)
 *
 * @param accountId
 * @param workerName
 * @param defaultSelectedVersionIds
 * @param acceptDefault
 * @returns
 */
async function promptVersionsToDeploy(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	defaultSelectedVersionIds: VersionId[],
	versionCache: VersionCache,
	acceptDefault: boolean
): Promise<VersionId[]> {
	// If the user has already specified all versions they want to deploy and
	// the defaults will be accepted (so there's no interactive prompt), skip fetching the
	// full deployable-versions list and only fetch the specific versions needed.
	const skipDeployableVersionsFetch =
		acceptDefault && defaultSelectedVersionIds.length > 0;

	await spinnerWhile({
		startMessage: "Fetching versions",
		async promise() {
			if (!skipDeployableVersionsFetch) {
				await fetchDeployableVersions(
					complianceConfig,
					accountId,
					workerName,
					versionCache
				);
			}
			await fetchVersions(
				complianceConfig,
				accountId,
				workerName,
				versionCache,
				...defaultSelectedVersionIds
			);
		},
	});

	const selectableVersions = Array.from(versionCache.values()).sort(
		(a, b) => b.metadata.created_on.localeCompare(a.metadata.created_on) // String#localeCompare should work because they are ISO strings
	);

	const question = "Which version(s) do you want to deploy?";

	const result = await inputPrompt<string[]>({
		type: "multiselect",
		question,
		options: selectableVersions.map((version) => ({
			value: version.id,
			label: version.id,
			sublabel: gray(`
${ZERO_WIDTH_SPACE}       Created:  ${version.metadata.created_on}
${ZERO_WIDTH_SPACE}           Tag:  ${
				version.annotations?.["workers/tag"] ?? BLANK_INPUT
			}
${ZERO_WIDTH_SPACE}       Message:  ${
				version.annotations?.["workers/message"] ?? BLANK_INPUT
			}
            `),
		})),
		label: "",
		helpText: "Use SPACE to select/unselect version(s) and ENTER to submit.",
		defaultValue: defaultSelectedVersionIds,
		acceptDefault,
		validate(versionIds) {
			if (versionIds === undefined) {
				return `You must select at least 1 version to deploy.`;
			}
		},
		renderers: {
			submit({ value: versionIds }) {
				assert(Array.isArray(versionIds));

				const label = brandColor(
					`${versionIds.length} Worker Version(s) selected`
				);

				const versions = versionIds?.map((versionId, i) => {
					const version = versionCache.get(versionId);
					assert(version);

					return `${grayBar}
${leftT} ${white(`    Worker Version ${i + 1}: `, version.id)}
${grayBar} ${gray("             Created: ", version.metadata.created_on)}
${grayBar} ${gray(
						"                 Tag: ",
						version.annotations?.["workers/tag"] ?? BLANK_INPUT
					)}
${grayBar} ${gray(
						"             Message: ",
						version.annotations?.["workers/message"] ?? BLANK_INPUT
					)}`;
				});

				return [
					`${leftT} ${question}`,
					`${leftT} ${label}`,
					...versions,
					grayBar,
				];
			},
		},
	});

	return result;
}

/**
 * Recursive function which prompts the user to enter the percentage of traffic for each version they already selected.
 * If the user enters percentages which do not total 100, they will be prompted to enter the percentages again.
 *
 * @param versionIds The Version IDs the user has selected to deploy
 * @param optionalVersionTraffic The percentages the user has specified as args (if any)
 * @param acceptDefault Whether prompt defaults should be accepted automatically
 * @param confirmedVersionTraffic The percentages the user has already entered. Used for recursive calls.
 * @returns A Map of Version IDs to their respective percentages confirmed by the user, totaling 100%
 */
async function promptPercentages(
	versionIds: VersionId[],
	optionalVersionTraffic: Map<VersionId, OptionalPercentage>,
	acceptDefault: boolean,
	confirmedVersionTraffic = new Map<VersionId, Percentage>()
): Promise<Map<VersionId, Percentage>> {
	let n = 0;
	for (const versionId of versionIds) {
		n++;

		const defaultVersionTraffic = assignAndDistributePercentages(
			versionIds,
			new Map([...optionalVersionTraffic, ...confirmedVersionTraffic])
		);

		const defaultValue = defaultVersionTraffic
			.get(versionId)
			?.toFixed(3)
			.replace(/\.?0+$/, ""); // strip unecessary 0s after the decimal (e.g. 20.000 -> 20, 20.500 -> 20.5)

		const question = `What percentage of traffic should Worker Version ${n} receive?`;

		const answer = await inputPrompt({
			type: "text",
			question,
			helpText: "(0-100)",
			label: `Traffic`,
			defaultValue,
			initialValue: confirmedVersionTraffic.get(versionId)?.toString(), // if the user already entered a value, override the default
			acceptDefault,
			format: (val) => `${val}%`,
			validate: (val) => {
				const input = val !== "" ? val : defaultValue;
				const percentage = parseFloat(input?.toString() ?? "");

				if (isNaN(percentage) || percentage < 0 || percentage > 100) {
					return "Please enter a number between 0 and 100.";
				}
			},
			renderers: {
				submit({ value }) {
					const percentage = parseFloat(value?.toString() ?? "");

					return [
						leftT + cli.space() + white(question),
						leftT +
							cli.space() +
							brandColor(`${percentage}%`) +
							gray(" of traffic"),
						leftT,
					];
				},
			},
		});

		const percentage = parseFloat(answer);

		confirmedVersionTraffic.set(versionId, percentage);
	}

	// If the subtotal doesn't pass validation, prompt the user to provide the percentages again (initialValue will be what was entered previously)
	try {
		const { subtotal } = summariseVersionTraffic(
			confirmedVersionTraffic,
			versionIds
		);

		validateTrafficSubtotal(subtotal);
	} catch (err) {
		if (err instanceof UserError) {
			// if the user has indicated they'll accept all defaults
			// then rethrow to avoid an infinite loop of reprompting
			if (acceptDefault) {
				throw err;
			}

			cli.error(err.message, undefined, leftT);

			return promptPercentages(
				versionIds,
				optionalVersionTraffic,
				acceptDefault,
				confirmedVersionTraffic
			);
		}

		throw err;
	}

	return confirmedVersionTraffic;
}

async function maybePatchSettings(
	config: Config,
	accountId: string,
	workerName: string
) {
	const maybeUndefinedSettings = {
		logpush: config.logpush,
		tail_consumers: config.tail_consumers,
		streaming_tail_consumers: config.streaming_tail_consumers,
		observability: config.observability, // TODO reconcile with how regular deploy handles empty state
	};
	const definedSettings = Object.fromEntries(
		Object.entries(maybeUndefinedSettings).filter(
			([, value]) => value !== undefined
		)
	);

	const hasZeroSettingsToSync = Object.keys(definedSettings).length === 0;
	if (hasZeroSettingsToSync) {
		cli.log("No non-versioned settings to sync. Skipping...");
		return;
	}

	const patchedSettings = await spinnerWhile({
		startMessage: `Syncing non-versioned settings`,
		async promise() {
			return await patchNonVersionedScriptSettings(
				config,
				accountId,
				workerName,
				definedSettings
			);
		},
	});

	const observability: Record<string, string> = {};
	if (patchedSettings.observability) {
		observability["enabled"] = String(patchedSettings.observability.enabled);
		if (patchedSettings.observability.head_sampling_rate) {
			observability["head_sampling_rate"] = String(
				patchedSettings.observability.head_sampling_rate
			);
		}
	}
	const formattedSettings = formatLabelledValues(
		{
			logpush: String(patchedSettings.logpush ?? "<skipped>"),
			observability:
				Object.keys(observability).length > 0
					? formatLabelledValues(observability)
					: "<skipped>",
			tail_consumers:
				patchedSettings.tail_consumers
					?.map((tc) =>
						tc.environment ? `${tc.service} (${tc.environment})` : tc.service
					)
					.join("\n") ?? "<skipped>",
			streaming_tail_consumers:
				patchedSettings.streaming_tail_consumers
					?.map((stc) => stc.service)
					.join("\n") ?? "<skipped>",
		},
		{
			labelJustification: "right",
			indentationCount: 4,
		}
	);

	cli.log("Synced non-versioned settings:\n" + formattedSettings);
}

// ***********
//    UNITS
// ***********
/**
 * Parses an optional `@<percentage>` suffix from a shorthand spec (e.g.
 * `<version-id>@<percentage>` or `<tag>@<percentage>`), validating that the
 * percentage (if present) is a number between 0 and 100.
 *
 * @param percentageString The raw percentage portion (after the `@`), if any.
 * @param spec The full spec string, used for error messages.
 * @param specLabel A label describing the arg the spec came from, used for error messages.
 * @returns The parsed percentage, or `null` if none was specified.
 */
function parseOptionalPercentage(
	percentageString: string | undefined,
	spec: string,
	specLabel: string
): OptionalPercentage {
	if (percentageString === undefined || percentageString === "") {
		return null;
	}

	const percentage = parseFloat(percentageString);

	if (isNaN(percentage)) {
		throw new UserError(
			`Could not parse percentage value from ${specLabel} "${spec}"`,
			{ telemetryMessage: "versions deploy percentage parse failed" }
		);
	}

	if (percentage < 0 || percentage > 100) {
		throw new UserError(
			`Percentage value (${percentage}%) parsed from ${specLabel} "${spec}" must be between 0 and 100.`,
			{
				telemetryMessage: "versions deploy positional percentage out of range",
			}
		);
	}

	return percentage;
}

export type ParseVersionSpecsArgs = {
	percentage?: number[];
	versionId?: string[];
	versionSpecs?: string[];
};
export function parseVersionSpecs(
	args: ParseVersionSpecsArgs
): Map<VersionId, OptionalPercentage> {
	const versionIds: string[] = [];
	const percentages: OptionalPercentage[] = [];

	for (const spec of args.versionSpecs ?? []) {
		const [versionId, percentageString] = spec.split("@");

		const percentage = parseOptionalPercentage(
			percentageString,
			spec,
			"version-spec positional arg"
		);

		versionIds.push(versionId);
		percentages.push(percentage);
	}

	// after parsing positonal args, merge in the explicit args
	// the 2 kinds of args shouldn't be used together but, if they are, positional args are given precedence

	const UUID_REGEX =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
	for (const versionId of args.versionId ?? []) {
		if (!UUID_REGEX.test(versionId)) {
			throw new UserError(`Version ID must be a valid UUID (${versionId}).`, {
				telemetryMessage: "versions deploy invalid version id",
			});
		}

		versionIds.push(versionId);
	}

	for (const percentage of args.percentage ?? []) {
		if (percentage < 0 || percentage > 100) {
			throw new UserError(
				`Percentage value (${percentage}%) must be between 0 and 100.`,
				{ telemetryMessage: "versions deploy percentage out of range" }
			);
		}

		percentages.push(percentage);
	}

	const optionalVersionTraffic = new Map<VersionId, OptionalPercentage>(
		versionIds.map((_, i) => [versionIds[i], percentages[i] ?? null])
	);

	return optionalVersionTraffic;
}

type ParseTagSpecsArgs = {
	versionTag?: string[];
};

// A percentage suffix in a `<version-tag>@<percentage>` spec, e.g. "100", "100%"
// or "50.5%". An out-of-range value like "101%" still matches (and is reported
// later by parseOptionalPercentage); a non-numeric suffix does not.
const PERCENTAGE_SUFFIX_REGEX = /^-?\d+(\.\d+)?%?$/;

/**
 * Splits a `<version-tag>@<percentage>` spec into its tag and percentage parts.
 *
 * Tags can contain `@` (the upload `--tag` flag accepts arbitrary strings), so
 * we split on the *last* `@` and only treat the suffix as a percentage when it
 * actually looks like one. That way `v1.0@beta@100%` parses as tag `v1.0@beta`
 * at 100%, while `v1.0@beta` (no percentage) is kept whole as the tag rather
 * than misreading `beta` as a percentage.
 */
function splitTagSpec(spec: string): {
	tag: string;
	percentageString: string | undefined;
} {
	const atIndex = spec.lastIndexOf("@");
	if (atIndex === -1) {
		return { tag: spec, percentageString: undefined };
	}

	const suffix = spec.substring(atIndex + 1);

	// A trailing `@` (empty suffix) is an explicit "no percentage" separator,
	// letting you keep a tag that ends in something percentage-like whole.
	if (suffix === "") {
		return { tag: spec.substring(0, atIndex), percentageString: undefined };
	}

	if (PERCENTAGE_SUFFIX_REGEX.test(suffix)) {
		return { tag: spec.substring(0, atIndex), percentageString: suffix };
	}

	return { tag: spec, percentageString: undefined };
}

/**
 * Parses the `--version-tag` args into a map of tag to optional percentage,
 * supporting the `<version-tag>@<percentage>` shorthand. Tags are resolved to
 * Version IDs later by {@link resolveTagsToVersions}.
 */
export function parseTagSpecs(
	args: ParseTagSpecsArgs
): Map<string, OptionalPercentage> {
	const tagTraffic = new Map<string, OptionalPercentage>();

	for (const spec of args.versionTag ?? []) {
		const { tag, percentageString } = splitTagSpec(spec);

		if (!tag) {
			throw new UserError(
				`Could not parse a tag from --version-tag arg "${spec}".`,
				{ telemetryMessage: "versions deploy tag parse failed" }
			);
		}

		const percentage = parseOptionalPercentage(
			percentageString,
			spec,
			"--version-tag arg"
		);

		tagTraffic.set(tag, percentage);
	}

	return tagTraffic;
}

/**
 * Resolves tags (e.g. commit SHAs supplied via `--version-tag`) to Version IDs by
 * matching against the `workers/tag` annotation on the worker's deployable
 * versions.
 *
 * Tags are not guaranteed to be unique, so this errors if a tag matches more
 * than one version, prompting the user to disambiguate with a Version ID. It
 * also errors if a tag matches no deployable version (e.g. the version has aged
 * out of the deployable window).
 *
 * The fetched versions populate `versionCache`, so a subsequent
 * `promptVersionsToDeploy` call can reuse them without re-fetching.
 */
async function resolveTagsToVersions(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	tagTraffic: Map<string, OptionalPercentage>,
	versionCache: VersionCache
): Promise<Map<VersionId, OptionalPercentage>> {
	const versions = await spinnerWhile({
		startMessage: "Resolving tags to versions",
		promise() {
			return fetchDeployableVersions(
				complianceConfig,
				accountId,
				workerName,
				versionCache
			);
		},
	});

	// A tag may be present on more than one version (e.g. a re-deploy of the same
	// commit, or a secret change inheriting the tag), so collect all matches.
	const versionsByTag = new Map<string, ApiVersion[]>();
	for (const version of versions) {
		const tag = version.annotations?.["workers/tag"];
		if (tag === undefined) {
			continue;
		}

		const matches = versionsByTag.get(tag) ?? [];
		matches.push(version);
		versionsByTag.set(tag, matches);
	}

	const resolvedVersionTraffic = new Map<VersionId, OptionalPercentage>();
	for (const [tag, percentage] of tagTraffic) {
		const matches = versionsByTag.get(tag) ?? [];

		if (matches.length === 0) {
			throw new UserError(
				`No deployable version found with tag "${tag}".\nTags can only be resolved against recent (deployable) versions. Run \`wrangler versions list\` to see available versions, or deploy by Version ID directly.`,
				{ telemetryMessage: "versions deploy tag not found" }
			);
		}

		if (matches.length > 1) {
			const ids = matches
				.sort((a, b) =>
					b.metadata.created_on.localeCompare(a.metadata.created_on)
				)
				.map((version) => `  - ${version.id}`)
				.join("\n");
			throw new UserError(
				`Tag "${tag}" matches multiple versions:\n${ids}\nDeploy by Version ID directly to disambiguate.`,
				{ telemetryMessage: "versions deploy tag ambiguous" }
			);
		}

		resolvedVersionTraffic.set(matches[0].id, percentage);
	}

	return resolvedVersionTraffic;
}

export function assignAndDistributePercentages(
	versionIds: VersionId[],
	optionalVersionTraffic: Map<VersionId, OptionalPercentage>
): Map<VersionId, Percentage> {
	const { subtotal, unspecifiedCount } = summariseVersionTraffic(
		optionalVersionTraffic,
		versionIds
	);

	const unspecifiedPercentageReplacement =
		unspecifiedCount === 0 || subtotal > 100
			? 0
			: (100 - subtotal) / unspecifiedCount;

	const versionTraffic = new Map<VersionId, Percentage>(
		versionIds.map((versionId) => [
			versionId,
			optionalVersionTraffic.get(versionId) ?? unspecifiedPercentageReplacement,
		])
	);

	return versionTraffic;
}

export function summariseVersionTraffic(
	optionalVersionTraffic: Map<VersionId, OptionalPercentage>,
	versionIds: VersionId[] = Array.from(optionalVersionTraffic.keys())
) {
	const versionsWithoutPercentage = versionIds.filter(
		(versionId) => optionalVersionTraffic.get(versionId) == null
	);
	const percentages = versionIds.map<OptionalPercentage>(
		(versionId) => optionalVersionTraffic.get(versionId) ?? null
	);
	const percentagesSubtotal = percentages.reduce<number>(
		(sum, x) => sum + (x ?? 0),
		0
	);

	return {
		subtotal: percentagesSubtotal,
		unspecifiedCount: versionsWithoutPercentage.length,
	};
}

export function validateTrafficSubtotal(
	subtotal: number,
	{ max = 100, min = 100, epsilon = EPSILON } = {}
) {
	const isAbove = subtotal > max + epsilon;
	const isBelow = subtotal < min - epsilon;

	if (max === min && (isAbove || isBelow)) {
		throw new UserError(
			`Sum of specified percentages (${subtotal}%) must be ${max}%`,
			{ telemetryMessage: "versions deploy traffic subtotal mismatch" }
		);
	}
	if (isAbove) {
		throw new UserError(
			`Sum of specified percentages (${subtotal}%) must be at most ${max}%`,
			{
				telemetryMessage: "versions deploy traffic subtotal above maximum",
			}
		);
	}
	if (isBelow) {
		throw new UserError(
			`Sum of specified percentages (${subtotal}%) must be at least ${min}%`,
			{
				telemetryMessage: "versions deploy traffic subtotal below minimum",
			}
		);
	}
}
