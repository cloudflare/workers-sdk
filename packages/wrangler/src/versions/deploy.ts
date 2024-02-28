import assert from "assert";
import path from "path";
import * as cli from "@cloudflare/cli";
import { brandColor, gray, white } from "@cloudflare/cli/colors";
import {
	grayBar,
	inputPrompt,
	leftT,
	spinner,
} from "@cloudflare/cli/interactive";
import { fetchResult } from "../cfetch";
import { findWranglerToml, readConfig } from "../config";
import { UserError } from "../errors";
import { printWranglerBanner } from "../update-check";
import { requireAuth } from "../user";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

const EPSILON = 0.001; // used to avoid floating-point errors. Comparions to a value +/- EPSILON will mean "roughly equals the value".
const BLANK_INPUT = "-"; // To be used where optional user-input is displayed and the value is nullish
const ZERO_WIDTH_SPACE = "​"; // Some log lines get trimmed and so, to indent, the line is prefixed with a zero-width space
const VERSION_CACHE = new Map<string, WorkerVersion>();

type Args = StrictYargsOptionsToInterface<typeof versionsDeployOptions>;

type OptionalPercentage = number | null; // null means automatically assign (evenly distribute remaining traffic)
type Percentage = number;
type UUID = string;
type VersionId = UUID;
type WorkerVersion = {
	id: VersionId;
	created: Date;
	tag?: string;
	message?: string;
};
type ApiDeployment = {
	id: string;
	source: "api" | string;
	strategy: "percentage" | string;
	author_email: string;
	annotations: Record<string, string>;
	versions: Array<{ version_id: VersionId; percentage: Percentage }>;
	created_on: string;
};
type ApiVersion = {
	id: VersionId;
	number: number;
	metadata: {
		created_on: string;
		modified_on: string;
		source: "api" | string;
		author_id: string;
		author_email: string;
	};
	annotations: Record<string, string> & {
		"workers/triggered_by"?: "upload" | string;
		"workers/message"?: string;
		"workers/tag"?: string;
	};
	// resources: { script: [Object]; script_runtime: [Object]; bindings: [] };
};

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
				"Shorthand notation to deploy Worker Version(s) [<version-id>@<percentage>...].",
			type: "string",
			array: true,
		})
		.option("message", {
			describe: "Description of this deployment (optional)",
			type: "string",
			requiresArg: true,
		})
		.option("tag", {
			describe: "Tag attribute of this deployment (optional)",
			type: "string",
			requiresArg: true,
		})
		.option("yes", {
			alias: "y",
			describe: "Automatically accept defaults to prompts.",
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
			default: 2,
		});
}

export async function versionsDeployHandler(
	args: StrictYargsOptionsToInterface<typeof versionsDeployOptions>
) {
	await printWranglerBanner();

	const accountId = await getAccountId(args);
	const workerName = args.name ?? "worker-app";
	const optionalVersionTraffic = parseVersionSpecs(args);

	cli.startSection(
		"Deploy Worker Versions",
		"by splitting traffic between multiple versions",
		true
	);

	await printLatestDeployment(accountId, workerName);

	// prompt to confirm or change the versionIds from the args
	const confirmedVersionsToDeploy = await promptVersionsToDeploy(
		accountId,
		workerName,
		[...optionalVersionTraffic.keys()]
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
		question: "Add a deployment message",
		helpText: "(optional)",
	});

	// // prompt for deployment tag
	// const tag = await inputPrompt<string | undefined>({
	// 	type: "text",
	// 	label: "Deployment tag",
	// 	defaultValue: args.tag,
	// 	question: "Add a deployment tag",
	// 	helpText: "(optional)",
	// });

	// if (args.dryRun) {
	// 	cli.cancel("--dry-run: exiting");
	// 	return;
	// }

	const start = Date.now();

	await createDeployment(
		accountId,
		workerName,
		confirmedVersionTraffic,
		message
		// , tag
	);

	const elapsedMilliseconds = Date.now() - start;
	const elapsedSeconds = elapsedMilliseconds / 1000;
	const elapsedString = `${elapsedSeconds.toFixed(2)} sec`;
	const trafficSummaryString = Array.from(confirmedVersionTraffic)
		.map(([versionId, percentage]) => `version ${versionId} at ${percentage}%`)
		.join(" and ");

	cli.success(
		`Deployed ${workerName} ${trafficSummaryString} (${elapsedString})`
	);
}

async function getAccountId(
	args: Pick<Args, "config" | "name" | "dryRun" | "experimentalJsonConfig">
) {
	const configPath =
		args.config || (args.name && findWranglerToml(path.dirname(args.name)));
	const config = readConfig(configPath, args);
	const accountId = await requireAuth(config);

	return accountId;
}

async function printLatestDeployment(accountId: string, workerName: string) {
	const s = spinner();
	s.start("Fetching latest deployment");
	const [versions, traffic] = await fetchLatestDeploymentVersions(
		accountId,
		workerName
	);
	s.stop();

	cli.logRaw(
		`${leftT} Your current deployment has ${versions.length} version(s):`
	);

	for (const version of versions) {
		const trafficString = brandColor(`(${traffic.get(version.id)}%)`);
		const versionIdString = white(version.id);

		cli.log(
			gray(`
${trafficString} ${versionIdString}
      Created:  ${version.created.toLocaleString()}
          Tag:  ${version.tag ?? BLANK_INPUT}
      Message:  ${version.message ?? BLANK_INPUT}`)
		);
	}

	cli.newline();

	VERSION_CACHE; // store in
}

async function promptVersionsToDeploy(
	accountId: string,
	workerName: string,
	defaultSelectedVersionIds: VersionId[]
): Promise<VersionId[]> {
	const s = spinner();
	s.start("Fetching deployable versions");
	await fetchLatestUploadedVersions(accountId, workerName);
	await fetchVersions(accountId, workerName, ...defaultSelectedVersionIds);
	s.stop();

	const selectableVersions = Array.from(VERSION_CACHE.values()).sort(
		(a, b) => b.created.getTime() - a.created.getTime()
	);

	const question = "Which version(s) do you want to deploy?";

	const result = await inputPrompt<string[]>({
		type: "multiselect",
		question,
		options: selectableVersions.map((version) => ({
			value: version.id,
			label: version.id,
			sublabel: gray(`
${ZERO_WIDTH_SPACE}       Created:  ${version.created.toLocaleString()}
${ZERO_WIDTH_SPACE}           Tag:  ${version.tag ?? BLANK_INPUT}
${ZERO_WIDTH_SPACE}       Message:  ${version.message ?? BLANK_INPUT}
            `),
		})),
		label: "",
		helpText: "Use SPACE to select/unselect version(s) and ENTER to submit.",
		defaultValue: defaultSelectedVersionIds,
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
					const version = VERSION_CACHE.get(versionId);

					// shouldn't be possible, but better a UserError than an assertion error
					if (version === undefined) throw new UserError("Invalid Version ID");

					return `${grayBar}
${leftT} ${white(`    Worker Version ${i + 1}: `, version.id)}
${grayBar} ${gray("             Created: ", version.created.toLocaleString())}
${grayBar} ${gray("                 Tag: ", version.tag ?? BLANK_INPUT)}
${grayBar} ${gray("             Message: ", version.message ?? BLANK_INPUT)}`;
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

async function promptPercentages(
	versionIds: VersionId[],
	optionalVersionTraffic: Map<VersionId, OptionalPercentage>,
	yesFlag: boolean,
	confirmedVersionTraffic = new Map<string, number>()
) {
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
			initialValue: confirmedVersionTraffic.get(versionId)?.toString(),
			format: (val) => `${val}%`,
			validate: (val) => {
				const input = val !== "" ? val : defaultValue;
				const percentage = parseFloat(input?.toString() ?? "");

				if (isNaN(percentage) || percentage < 0 || percentage > 100)
					return "Please enter a number between 0 and 100.";
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

	const { subtotal } = summariseVersionTraffic(
		confirmedVersionTraffic,
		versionIds
	);
	try {
		validateTrafficSubtotal(subtotal);
	} catch (err) {
		if (err instanceof UserError) {
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

// ***********
//    API
// ***********

async function fetchVersion(
	accountId: string,
	workerName: string,
	versionId: VersionId
) {
	const cachedVersion = VERSION_CACHE.get(versionId);
	if (cachedVersion) return cachedVersion;

	const apiVersion = await fetchResult<ApiVersion>(
		`/accounts/${accountId}/workers/scripts/${workerName}/versions/${versionId}`
	);

	const version = castAndCacheWorkerVersion(apiVersion);

	return version;
}
async function fetchVersions(
	accountId: string,
	workerName: string,
	...versionIds: VersionId[]
) {
	return Promise.all(
		versionIds.map((versionId) =>
			fetchVersion(accountId, workerName, versionId)
		)
	);
}
async function fetchLatestDeploymentVersions(
	accountId: string,
	workerName: string
): Promise<[WorkerVersion[], Map<VersionId, Percentage>]> {
	const { deployments } = await fetchResult<{ deployments: ApiDeployment[] }>(
		`/accounts/${accountId}/workers/scripts/${workerName}/deployments`
	);

	const latestDeployment = deployments.at(0); // TODO: is the latest deployment .at(0) or .at(-1)?
	if (!latestDeployment) return [[], new Map()];

	const versionTraffic = new Map(
		latestDeployment.versions.map(({ version_id: versionId, percentage }) => [
			versionId,
			percentage,
		])
	);
	const versions = await fetchVersions(
		accountId,
		workerName,
		...versionTraffic.keys()
	);

	return [versions, versionTraffic];
}
async function fetchLatestUploadedVersions(
	accountId: string,
	workerName: string
): Promise<WorkerVersion[]> {
	const { items } = await fetchResult<{ items: ApiVersion[] }>(
		`/accounts/${accountId}/workers/scripts/${workerName}/versions`
	);

	const versions = items.map(castAndCacheWorkerVersion);

	return versions;
}
function castAndCacheWorkerVersion(apiVersion: ApiVersion) {
	const version: WorkerVersion = {
		id: apiVersion.id,
		created: new Date(apiVersion.metadata.created_on),
		message: apiVersion.annotations["workers/message"],
		tag: apiVersion.annotations["workers/tag"],
	};

	console.log(apiVersion, "\n\n\n");
	VERSION_CACHE.set(version.id, version);

	return version;
}
async function createDeployment(
	accountId: string,
	workerName: string,
	versionTraffic: Map<VersionId, Percentage>,
	message: string | undefined
	//, tag: string | undefined
) {
	const res = await fetchResult(
		`/accounts/${accountId}/workers/scripts/${workerName}/deployments`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				strategy: "percentage",
				versions: Array.from(versionTraffic).map(
					([version_id, percentage]) => ({ version_id, percentage })
				),
				annotations: {
					"workers/triggered_by": "deployment",
					"workers/message": message,
					// "workers/tag": tag,
				},
			}),
		}
	);

	// TODO: handle specific errors

	return res;
}

// ***********
//    UNITS
// ***********

export function parseVersionSpecs(
	args: Pick<
		StrictYargsOptionsToInterface<typeof versionsDeployOptions>,
		"versionSpecs" | "versionId" | "percentage"
	>
): Map<VersionId, OptionalPercentage> {
	const versionIds: string[] = [];
	const percentages: OptionalPercentage[] = [];

	for (const spec of args.versionSpecs ?? []) {
		const [versionId, percentageString] = spec.split("@");

		const percentage =
			percentageString === "" ? null : parseFloat(percentageString);

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

function assignAndDistributePercentages(
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

function summariseVersionTraffic(
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

function validateTrafficSubtotal(
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
