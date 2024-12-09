import { applyCommand, applyCommandOptionalYargs } from "./apply";
import { handleFailure } from "./common";
import { createCommand, createCommandOptionalYargs } from "./create";
import { curlCommand, yargsCurl } from "./curl";
import { deleteCommand, deleteCommandOptionalYargs } from "./delete";
import { registriesCommand } from "./images/images";
import { listCommand, listDeploymentsYargs } from "./list";
import { modifyCommand, modifyCommandOptionalYargs } from "./modify";
import { sshCommand } from "./ssh/ssh";
import type { CommonYargsArgvJSON, CommonYargsOptions } from "../yargs-types";
import type { CommandModule } from "yargs";

function internalCommands(args: CommonYargsArgvJSON) {
	try {
		// Add dynamically an internal module that we can attach internal commands
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const cloudchamberInternalRequireEntry = require("./internal/index");
		return cloudchamberInternalRequireEntry.internalCommands(args);
	} catch {
		return args;
	}
}

export const cloudchamber = (
	yargs: CommonYargsArgvJSON,
	subHelp: CommandModule<CommonYargsOptions, CommonYargsOptions>
) => {
	yargs = internalCommands(yargs);
	return yargs
		.command(
			"delete [deploymentId]",
			"Delete an existing deployment that is running in the Cloudflare edge",
			(args) => deleteCommandOptionalYargs(args),
			(args) => handleFailure(deleteCommand)(args)
		)
		.command(
			"create",
			"Create a new deployment",
			(args) => createCommandOptionalYargs(args),
			(args) => handleFailure(createCommand)(args)
		)
		.command(
			"list [deploymentIdPrefix]",
			"List and view status of deployments",
			(args) => listDeploymentsYargs(args),
			(args) => handleFailure(listCommand)(args)
		)
		.command(
			"modify [deploymentId]",
			"Modify an existing deployment",
			(args) => modifyCommandOptionalYargs(args),
			(args) => handleFailure(modifyCommand)(args)
		)
		.command("ssh", "Manage the ssh keys of your account", (args) =>
			sshCommand(args).command(subHelp)
		)
		.command("registries", "Configure registries via Cloudchamber", (args) =>
			registriesCommand(args).command(subHelp)
		)
		.command(
			"curl <path>",
			"send a request to an arbitrary cloudchamber endpoint",
			(args) => yargsCurl(args),
			(args) => handleFailure(curlCommand)(args)
		)
		.command(
			"apply",
			"apply the changes in the container applications to deploy",
			(args) => applyCommandOptionalYargs(args),
			(args) => handleFailure(applyCommand)(args)
		);
};
