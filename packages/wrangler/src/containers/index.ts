import { applyCommand, applyCommandOptionalYargs } from "../cloudchamber/apply";
import {
	buildCommand,
	buildYargs,
	pushCommand,
	pushYargs,
} from "../cloudchamber/build";
import { handleFailure } from "../cloudchamber/common";
import { imagesCommand } from "../cloudchamber/images/list";
import {
	deleteCommand,
	deleteYargs,
	infoCommand,
	infoYargs,
	listCommand,
	listYargs,
} from "./containers";
import type { Scope } from "../user";
import type { CommonYargsArgvJSON, CommonYargsOptions } from "../yargs-types";
import type { CommandModule } from "yargs";

export const containersScope: Scope = "containers:write";

export const containers = (
	yargs: CommonYargsArgvJSON,
	subHelp: CommandModule<CommonYargsOptions, CommonYargsOptions>
) => {
	return yargs
		.command(
			"build [PATH]",
			"build a dockerfile",
			(args) => buildYargs(args),
			(args) => handleFailure(buildCommand, containersScope)(args)
		)
		.command(
			"push [TAG]",
			"push a tagged image to a Cloudflare managed registry, which is automatically integrated with your account",
			(args) => pushYargs(args),
			(args) => handleFailure(pushCommand, containersScope)(args)
		)
		.command(
			"apply",
			"apply the changes in the container applications to deploy",
			(args) => applyCommandOptionalYargs(args),
			(args) => handleFailure(applyCommand, containersScope)(args)
		)
		.command(
			"images",
			"perform operations on images in your Cloudflare managed registry",
			(args) => imagesCommand(args).command(subHelp)
		)
		.command(
			"info [ID]",
			"get information about a specific container",
			(args) => infoYargs(args),
			(args) => handleFailure(infoCommand)(args)
		)
		.command(
			"list",
			"list containers",
			(args) => listYargs(args),
			(args) => handleFailure(listCommand)(args)
		)
		.command(
			"delete [ID]",
			"delete a container",
			(args) => deleteYargs(args),
			(args) => handleFailure(deleteCommand)(args)
			(args) => imagesCommand(args, containersScope).command(subHelp)
		);
};
