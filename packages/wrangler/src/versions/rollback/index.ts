import * as cli from "@cloudflare/cli";
import { spinnerWhile } from "@cloudflare/cli/interactive";
import { confirm, prompt } from "../../dialogs";
import { UserError } from "../../errors";
import { logger } from "../../logger";
import { APIError } from "../../parse";
import { requireAuth } from "../../user";
import { createDeployment, fetchLatestDeployments, fetchVersion } from "../api";
import { printLatestDeployment, printVersions } from "../deploy";
import { getConfig } from "../list";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";
import type { VersionId } from "../types";

export const CANNOT_ROLLBACK_WITH_MODIFIED_SECERT_CODE = 10220;

export type VersionsRollbackArgs = StrictYargsOptionsToInterface<
	typeof versionsRollbackOptions
>;

export default function registerVersionsRollbackCommand(
	yargs: CommonYargsArgv,
	description = "🔙 Rollback to a Worker Version"
) {
	return yargs.command(
		"rollback [version-id]",
		description,
		versionsRollbackOptions,
		versionsRollbackHandler
	);
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
			describe: "The reason for this rollback",
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

	const message = await prompt(
		"Please provide an optional message for this rollback (120 characters max)",
		{
			defaultValue: args.message ?? "Rollback",
		}
	);

	const version = await fetchVersion(accountId, workerName, versionId);
	cli.warn(
		`You are about to rollback to Worker Version ${versionId}.\nThis will immediately replace the current deployment and become the active deployment across all your deployed triggers.\nHowever, your local development environment will not be affected by this rollback.\nRolling back to a previous deployment will not rollback any of the bound resources (Durable Object, D1, R2, KV, etc).`,
		{ multiline: true, shape: cli.shapes.leftT }
	);
	const rollbackTraffic = new Map([[versionId, 100]]);
	printVersions([version], rollbackTraffic);

	const confirmed = await confirm(
		"Are you sure you want to deploy this Worker Version to 100% of traffic?",
		{ defaultValue: true }
	);
	if (!confirmed) {
		cli.cancel("Aborting rollback...");
		return;
	}

	logger.log("Performing rollback...");
	try {
		await createDeployment(accountId, workerName, rollbackTraffic, message);
	} catch (e) {
		if (
			e instanceof APIError &&
			e.code === CANNOT_ROLLBACK_WITH_MODIFIED_SECERT_CODE
		) {
			// This is not great but is the best way I could think to handle for now
			const errorMsg = e.notes[0].text.replace(
				` [code: ${CANNOT_ROLLBACK_WITH_MODIFIED_SECERT_CODE}]`,
				""
			);
			const targetString = "The following secrets have changed:";
			const changedSecrets = errorMsg
				.substring(errorMsg.indexOf(targetString) + targetString.length + 1)
				.split(", ");

			const secretConfirmation = await confirm(
				`The following secrets have changed since version ${versionId} was deployed. ` +
					`Please confirm you wish to continue with the rollback\n` +
					changedSecrets.map((secret) => `  * ${secret}`).join("\n")
			);

			if (secretConfirmation) {
				await createDeployment(
					accountId,
					workerName,
					rollbackTraffic,
					message,
					true
				);
			} else {
				cli.cancel("Aborting rollback...");
			}
		} else {
			throw e;
		}
	}

	cli.success(
		`Worker Version ${versionId} has been deployed to 100% of traffic.`
	);

	logger.log("\nCurrent Version ID: " + versionId);
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

		if (stableVersion) {
			return stableVersion.version_id;
		}
	}

	// if we get here, we did not find a stable version
	throw new Error(
		"Could not find stable Worker Version to rollback to. Please try again with an explicit Version ID."
	);
}
