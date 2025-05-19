import { applyCommand, applyCommandOptionalYargs } from "./apply";
import { buildCommand, buildYargs, pushCommand, pushYargs } from "./build";
import { cloudchamberScope, handleFailure } from "./common";
import { createCommand, createCommandOptionalYargs } from "./create";
import { curlCommand, yargsCurl } from "./curl";
import { deleteCommand, deleteCommandOptionalYargs } from "./delete";
import { registriesCommand } from "./images/images";
import { imagesCommand } from "./images/list";
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
			(args) => handleFailure(deleteCommand, cloudchamberScope)(args)
		)
		.command(
			"create",
			"Create a new deployment",
			(args) => createCommandOptionalYargs(args),
			(args) => handleFailure(createCommand, cloudchamberScope)(args)
		)
		.command(
			"list [deploymentIdPrefix]",
			"List and view status of deployments",
			(args) => listDeploymentsYargs(args),
			(args) => handleFailure(listCommand, cloudchamberScope)(args)
		)
		.command(
			"modify [deploymentId]",
			"Modify an existing deployment",
			(args) => modifyCommandOptionalYargs(args),
			(args) => handleFailure(modifyCommand, cloudchamberScope)(args)
		)
		.command("ssh", "Manage the ssh keys of your account", (args) =>
			sshCommand(args, cloudchamberScope).command(subHelp)
		)
		.command("registries", "Configure registries via Cloudchamber", (args) =>
			registriesCommand(args, cloudchamberScope).command(subHelp)
		)
		.command(
			"curl <path>",
			"send a request to an arbitrary Cloudchamber endpoint",
			(args) => yargsCurl(args),
			(args) => handleFailure(curlCommand, cloudchamberScope)(args)
		)
		.command(
			"apply",
			"apply the changes in the container applications to deploy",
			(args) => applyCommandOptionalYargs(args),
			(args) => handleFailure(applyCommand, cloudchamberScope)(args)
		)
		.command(
			"build [PATH]",
			"build a dockerfile",
			(args) => buildYargs(args),
			(args) => handleFailure(buildCommand, cloudchamberScope)(args)
		)
		.command(
			"push [TAG]",
			"push a tagged image to a Cloudflare managed registry, which is automatically integrated with your account",
			(args) => pushYargs(args),
			(args) => handleFailure(pushCommand, cloudchamberScope)(args)
		)
		.command(
			"images",
			"perform operations on images in your Cloudchamber registry",
			(args) => imagesCommand(args, cloudchamberScope).command(subHelp)
		);
};
