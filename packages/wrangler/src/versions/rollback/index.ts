import * as cli from "@cloudflare/cli";
import { inputPrompt, spinnerWhile } from "@cloudflare/cli/interactive";
import { UserError } from "../../errors";
import { requireAuth } from "../../user";
import { createDeployment, fetchLatestDeployments, fetchVersion } from "../api";
import { printLatestDeployment, printVersions } from "../deploy";
import { getConfig } from "../list";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
	SubHelp,
} from "../../yargs-types";
import type { VersionId } from "../types";

export type VersionsRollbackArgs = StrictYargsOptionsToInterface<
	typeof versionsRollbackOptions
>;

export default function registerVersionsRollbackCommand(
	yargs: CommonYargsArgv,
	epilogue: string,
	subHelp: SubHelp
) {
	return yargs
		.command(
			"rollback [version-id]",
			"🔙 Rollback to a Worker Version",
			versionsRollbackOptions,
			versionsRollbackHandler
		)
		.command(subHelp)
		.epilogue(epilogue);
}

export function versionsRollbackOptions(rollbackYargs: CommonYargsArgv) {
	return rollbackYargs
		.positional("version-id", {
			describe: "The ID of the Worker Version to rollback to",
			type: "string",
			demandOption: false,
		})
		.option("name", {
			describe: "The name of your worker",
			type: "string",
		})
		.option("message", {
			alias: "m",
			describe: "The reason for this rollback (optional)",
			type: "string",
			default: undefined,
		})
		.option("yes", {
			alias: "y",
			describe: "Automatically accept defaults to prompts",
			type: "boolean",
			default: false,
		});
}

export async function versionsRollbackHandler(args: VersionsRollbackArgs) {
	const config = getConfig(args);
	const accountId = await requireAuth(config);
	const workerName = args.name ?? config.name;

	if (workerName === undefined) {
		throw new UserError(
			'You need to provide a name of your worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`'
		);
	}

	await printLatestDeployment(accountId, workerName, new Map());

	const versionId =
		args.versionId ??
		(await spinnerWhile({
			promise: fetchDefaultRollbackVersionId(accountId, workerName),
			startMessage: "Finding latest stable Worker Version to rollback to",
			endMessage: "",
		}));

	const message = await inputPrompt({
		type: "text",
		label: "Message",
		question:
			"Please provide a message for this rollback (120 characters max, optional)?",
		defaultValue: args.message ?? "Rollback",
		acceptDefault: args.yes,
	});

	const version = await fetchVersion(accountId, workerName, versionId);
	cli.warn(`You are about to rollback to Worker Version ${versionId}:`);
	const rollbackTraffic = new Map([[versionId, 100]]);
	printVersions([version], rollbackTraffic);

	const confirm = await inputPrompt({
		type: "confirm",
		label: "Rollback",
		question:
			"Are you sure you want to deploy this Worker Version to 100% of traffic?",
		defaultValue: args.yes, // defaultValue: false.    if --yes, defaultValue: true
		acceptDefault: args.yes,
	});

	if (!confirm) {
		cli.log("Aborting rollback...");
		return;
	}

	await spinnerWhile({
		async promise() {
			await createDeployment(accountId, workerName, rollbackTraffic, message);
		},
		startMessage: `Performing rollback`,
		endMessage: "",
	});

	cli.success(
		`Worker Version ${versionId} has been deployed to 100% of traffic.`
	);
}

async function fetchDefaultRollbackVersionId(
	accountId: string,
	workerName: string
): Promise<VersionId> {
	const deployments = await fetchLatestDeployments(accountId, workerName);

	// sort by latest first
	deployments.sort((a, b) => b.created_on.localeCompare(a.created_on));

	// we don't want to rollback to the current deployment so remove the latest (current) deployment
	deployments.shift();

	for (const deployment of deployments) {
		// we define a stable version as one deployed to 100%
		const stableVersion = deployment.versions.find(
			({ percentage }) => percentage === 100
		);

		if (stableVersion) return stableVersion.version_id;
	}

	// if we get here, we did not find a stable version
	throw new Error(
		"Could not find stable Worker Version to rollback to. Please try again with an explicit Version ID."
	);
}
