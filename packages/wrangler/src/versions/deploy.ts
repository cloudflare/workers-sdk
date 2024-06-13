import assert from "assert";
import path from "path";
import * as cli from "@cloudflare/cli";
import { brandColor, gray, white } from "@cloudflare/cli/colors";
import {
	grayBar,
	inputPrompt,
	leftT,
	spinnerWhile,
} from "@cloudflare/cli/interactive";
import { findWranglerToml, readConfig } from "../config";
import { UserError } from "../errors";
import { CI } from "../is-ci";
import isInteractive from "../is-interactive";
import * as metrics from "../metrics";
import { APIError } from "../parse";
import { printWranglerBanner } from "../update-check";
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
import type { Config } from "../config";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type {
	ApiDeployment,
	ApiVersion,
	Percentage,
	VersionCache,
	VersionId,
} from "./types";

const EPSILON = 0.001; // used to avoid floating-point errors. Comparions to a value +/- EPSILON will mean "roughly equals the value".
const BLANK_INPUT = "-"; // To be used where optional user-input is displayed and the value is nullish
const ZERO_WIDTH_SPACE = "\u200B"; // Some log lines get trimmed and so, to indent, the line is prefixed with a zero-width space

export type VersionsDeployArgs = StrictYargsOptionsToInterface<
	typeof versionsDeployOptions
>;

type OptionalPercentage = number | null; // null means automatically assign (evenly distribute remaining traffic)

export function versionsDeployOptions(yargs: CommonYargsArgv) {
	return yargs
		.option("name", {
			describe: "Name of the worker",
			type: "string",
			requiresArg: true,
		})
		.option("version-id", {
			describe: "Worker Version ID(s) to deploy",
			type: "array",
			string: true,
			requiresArg: true,
		})
		.option("percentage", {
			describe:
				"Percentage of traffic to split between Worker Version(s) (0-100)",
			type: "array",
			number: true,
			requiresArg: true,
		})
		.positional("version-specs", {
			describe:
				"Shorthand notation to deploy Worker Version(s) [<version-id>@<percentage>..]",
			type: "string",
			array: true,
		})
		.option("message", {
			describe: "Description of this deployment (optional)",
			type: "string",
			requiresArg: true,
		})
		.option("yes", {
			alias: "y",
			describe: "Automatically accept defaults to prompts",
			type: "boolean",
			default: false,
		})
		.option("dry-run", {
			describe: "Don't actually deploy",
			type: "boolean",
			default: false,
		})
		.option("max-versions", {
			hidden: true, // experimental, not supported long-term
			describe: "Maximum allowed versions to select",
			type: "number",
			default: 2, // (when server-side limitation is lifted, we can update this default or just remove the option entirely)
		});
}

export async function versionsDeployHandler(args: VersionsDeployArgs) {
	await printWranglerBanner();

	const config = getConfig(args);
	await metrics.sendMetricsEvent(
		"deploy worker versions",
		{},
		{
			sendMetrics: config.send_metrics,
		}
	);

	const accountId = await requireAuth(config);
	const workerName = args.name ?? config.name;

	if (workerName === undefined) {
		throw new UserError(
			'You need to provide a name of your worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`'
		);
	}

	const versionCache: VersionCache = new Map();
	const optionalVersionTraffic = parseVersionSpecs(args);

	cli.startSection(
		"Deploy Worker Versions",
		"by splitting traffic between multiple versions",
		true
	);

	await printLatestDeployment(accountId, workerName, versionCache);

	// prompt to confirm or change the versionIds from the args
	const confirmedVersionsToDeploy = await promptVersionsToDeploy(
		accountId,
		workerName,
		[...optionalVersionTraffic.keys()],
		versionCache,
		args.yes
	);

	// validate we have at least 1 version
	if (confirmedVersionsToDeploy.length === 0) {
		throw new UserError("You must select at least 1 version to deploy.");
	}

	// validate we have at most experimentalMaxVersions (default: 2)
	if (confirmedVersionsToDeploy.length > args.maxVersions) {
		throw new UserError(
			`You must select at most ${args.maxVersions} versions to deploy.`
		);
	}

	// prompt to confirm or change the percentages for each confirmed version to deploy
	const confirmedVersionTraffic = await promptPercentages(
		confirmedVersionsToDeploy,
		optionalVersionTraffic,
		args.yes
	);

	// prompt for deployment message
	const message = await inputPrompt<string | undefined>({
		type: "text",
		label: "Deployment message",
		defaultValue: args.message,
		acceptDefault: args.yes,
		question: "Add a deployment message",
		helpText: "(optional)",
	});

	if (args.dryRun) {
		cli.cancel("--dry-run: exiting");
		return;
	}

	const start = Date.now();

	await spinnerWhile({
		startMessage: `Deploying ${confirmedVersionsToDeploy.length} version(s)`,
		async promise() {
			await createDeployment(
				accountId,
				workerName,
				confirmedVersionTraffic,
				message
			);
		},
	});

	await maybePatchSettings(accountId, workerName, config);

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
}

function getConfig(
	args: Pick<VersionsDeployArgs, "config" | "name" | "experimentalJsonConfig">
) {
	const configPath =
		args.config || (args.name && findWranglerToml(path.dirname(args.name)));
	const config = readConfig(configPath, args);

	return config;
}

/**
 * Prompts the user for confirmation when overwriting the latest deployment, given that it's split.
 */
export async function confirmLatestDeploymentOverwrite(
	accountId: string,
	scriptName: string
) {
	try {
		const latest = await fetchLatestDeployment(accountId, scriptName);
		if (latest && latest.versions.length >= 2) {
			const versionCache: VersionCache = new Map();

			// Print message and confirmation.

			cli.warn(
				`Your last deployment has multiple versions. To progress that deployment use "wrangler versions deploy" instead.`,
				{ shape: cli.shapes.corners.tl, newlineBefore: false }
			);
			cli.newline();
			await printDeployment(
				accountId,
				scriptName,
				latest,
				"last",
				versionCache
			);

			return inputPrompt<boolean>({
				type: "confirm",
				question: `"wrangler deploy" will upload a new version and deploy it globally immediately.\nAre you sure you want to continue?`,
				label: "",
				defaultValue: !isInteractive() || CI.isCI(), // defaults to true in CI for back-compat
				acceptDefault: !isInteractive() || CI.isCI(),
			});
		}
	} catch (e) {
		const isNotFound = e instanceof APIError && e.code == 10007;
		if (!isNotFound) {
			throw e;
		}
	}
	return true;
}

export async function printLatestDeployment(
	accountId: string,
	workerName: string,
	versionCache: VersionCache
) {
	const latestDeployment = await spinnerWhile({
		startMessage: "Fetching latest deployment",
		async promise() {
			return fetchLatestDeployment(accountId, workerName);
		},
	});
	await printDeployment(
		accountId,
		workerName,
		latestDeployment,
		"current",
		versionCache
	);
}

export async function printDeployment(
	accountId: string,
	workerName: string,
	deployment: ApiDeployment | undefined,
	adjective: "current" | "last",
	versionCache: VersionCache
) {
	const [versions, traffic] = await fetchDeploymentVersions(
		accountId,
		workerName,
		deployment,
		versionCache
	);
	cli.logRaw(
		`${leftT} Your ${adjective} deployment has ${versions.length} version(s):`
	);
	printVersions(versions, traffic);
}

export function printVersions(
	versions: ApiVersion[],
	traffic: Map<VersionId, Percentage>
) {
	cli.newline();
	cli.log(formatVersions(versions, traffic));
	cli.newline();
}

export function formatVersions(
	versions: ApiVersion[],
	traffic: Map<VersionId, Percentage>
) {
	return versions
		.map((version) => {
			const trafficString = brandColor(`(${traffic.get(version.id)}%)`);
			const versionIdString = white(version.id);
			return gray(`${trafficString} ${versionIdString}
      Created:  ${version.metadata.created_on}
          Tag:  ${version.annotations?.["workers/tag"] ?? BLANK_INPUT}
      Message:  ${version.annotations?.["workers/message"] ?? BLANK_INPUT}`);
		})
		.join("\n\n");
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
 * @param yesFlag
 * @returns
 */
async function promptVersionsToDeploy(
	accountId: string,
	workerName: string,
	defaultSelectedVersionIds: VersionId[],
	versionCache: VersionCache,
	yesFlag: boolean
): Promise<VersionId[]> {
	await spinnerWhile({
		startMessage: "Fetching deployable versions",
		async promise() {
			await fetchDeployableVersions(accountId, workerName, versionCache);
			await fetchVersions(
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
		acceptDefault: yesFlag,
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
 * @param yesFlag Whether the user specified the --yes flag
 * @param confirmedVersionTraffic The percentages the user has already entered. Used for recursive calls.
 * @returns A Map of Version IDs to their respective percentages confirmed by the user, totaling 100%
 */
async function promptPercentages(
	versionIds: VersionId[],
	optionalVersionTraffic: Map<VersionId, OptionalPercentage>,
	yesFlag: boolean,
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
			acceptDefault: yesFlag,
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
			// if the user has indicated they'll accept all defaults (yesFlag)
			// then rethrow to avoid an infinite loop of reprompting
			if (yesFlag) {
				throw err;
			}

			cli.error(err.message, undefined, leftT);

			return promptPercentages(
				versionIds,
				optionalVersionTraffic,
				yesFlag,
				confirmedVersionTraffic
			);
		}

		throw err;
	}

	return confirmedVersionTraffic;
}

async function maybePatchSettings(
	accountId: string,
	workerName: string,
	config: Pick<Config, "logpush" | "tail_consumers">
) {
	const maybeUndefinedSettings = {
		logpush: config.logpush,
		tail_consumers: config.tail_consumers,
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
				accountId,
				workerName,
				definedSettings
			);
		},
	});

	const formattedSettings = formatLabelledValues(
		{
			logpush: String(patchedSettings.logpush ?? "<skipped>"),
			tail_consumers:
				patchedSettings.tail_consumers
					?.map((tc) =>
						tc.environment ? `${tc.service} (${tc.environment})` : tc.service
					)
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

export function parseVersionSpecs(
	args: Pick<
		VersionsDeployArgs,
		"_" | "versionSpecs" | "versionId" | "percentage"
	>
): Map<VersionId, OptionalPercentage> {
	const versionIds: string[] = [];
	const percentages: OptionalPercentage[] = [];

	for (const spec of args.versionSpecs ?? []) {
		const [versionId, percentageString] = spec.split("@");

		const percentage =
			percentageString === undefined || percentageString === ""
				? null
				: parseFloat(percentageString);

		if (percentage !== null) {
			if (isNaN(percentage)) {
				throw new UserError(
					`Could not parse percentage value from version-spec positional arg "${spec}"`
				);
			}

			if (percentage < 0 || percentage > 100) {
				throw new UserError(
					`Percentage value (${percentage}%) parsed from version-spec positional arg "${spec}" must be between 0 and 100.`
				);
			}
		}

		versionIds.push(versionId);
		percentages.push(percentage);
	}

	// after parsing positonal args, merge in the explicit args
	// the 2 kinds of args shouldn't be used together but, if they are, positional args are given precedence

	const UUID_REGEX =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
	for (const versionId of args.versionId ?? []) {
		if (!UUID_REGEX.test(versionId)) {
			throw new UserError(`Version ID must be a valid UUID (${versionId}).`);
		}

		versionIds.push(versionId);
	}

	for (const percentage of args.percentage ?? []) {
		if (percentage < 0 || percentage > 100) {
			throw new UserError(
				`Percentage value (${percentage}%) must be between 0 and 100.`
			);
		}

		percentages.push(percentage);
	}

	const optionalVersionTraffic = new Map<VersionId, OptionalPercentage>(
		versionIds.map((_, i) => [versionIds[i], percentages[i] ?? null])
	);

	return optionalVersionTraffic;
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
			`Sum of specified percentages (${subtotal}%) must be ${max}%`
		);
	}
	if (isAbove) {
		throw new UserError(
			`Sum of specified percentages (${subtotal}%) must be at most ${max}%`
		);
	}
	if (isBelow) {
		throw new UserError(
			`Sum of specified percentages (${subtotal}%) must be at least ${min}%`
		);
	}
}
