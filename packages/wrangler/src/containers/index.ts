import {
	buildCommand,
	buildYargs,
	pushCommand,
	pushYargs,
} from "../cloudchamber/build";
import { handleFailure } from "../cloudchamber/common";
import { imagesCommand } from "../cloudchamber/images/images";
import {
	deleteCommand,
	deleteYargs,
	infoCommand,
	infoYargs,
	listCommand,
	listYargs,
} from "./containers";
import type { CommonYargsArgv, CommonYargsOptions } from "../yargs-types";
import type { CommandModule } from "yargs";

export const containersScope = "containers:write" as const;

export const containers = (
	yargs: CommonYargsArgv,
	subHelp: CommandModule<CommonYargsOptions, CommonYargsOptions>
) => {
	return yargs
		.command(
			"build [PATH]",
			"Build a container image",
			(args) => buildYargs(args),
			(args) =>
				handleFailure(
					`wrangler containers build`,
					buildCommand,
					containersScope
				)(args)
		)
		.command(
			"push [TAG]",
			"Push a tagged image to a Cloudflare managed registry",
			(args) => pushYargs(args),
			(args) =>
				handleFailure(
					`wrangler containers push`,
					pushCommand,
					containersScope
				)(args)
		)
		.command(
			"images",
			"Perform operations on images in your Cloudflare managed registry",
			(args) => imagesCommand(args, containersScope).command(subHelp)
		)
		.command(
			"info [ID]",
			"Get information about a specific container",
			(args) => infoYargs(args),
			(args) =>
				handleFailure(
					`wrangler containers info`,
					infoCommand,
					containersScope
				)(args)
		)
		.command(
			"list",
			"List containers",
			(args) => listYargs(args),
			(args) =>
				handleFailure(
					`wrangler containers list`,
					listCommand,
					containersScope
				)(args)
		)
		.command(
			"delete [ID]",
			"Delete a container",
			(args) => deleteYargs(args),
			(args) =>
				handleFailure(
					`wrangler containers delete`,
					deleteCommand,
					containersScope
				)(args)
		);
};
