import { type CommandModule } from "yargs";
import { createCommand } from "./create";
import { deleteCommand } from "./delete";
import { RegistriesCommand } from "./images/images";
import { listCommand } from "./list";
import { modifyCommand } from "./modify";
import { SSHCommand } from "./ssh/ssh";
import type { CommonYargsOptions } from "../yargs-types";

export const CloudchamberCommand: CommandModule<
	CommonYargsOptions,
	CommonYargsOptions
> = {
	command: "cloudchamber",
	describe: "📦  Manage Cloudchamber",
	handler: () => {},
	builder: (yargsInit) => {
		const yargs = deleteCommand(
			modifyCommand(
				createCommand(
					listCommand(
						yargsInit.option("json", {
							requiresArg: false,
							default: false,
							type: "boolean",
							describe: "if this is true, wrangler will output json only",
						})
					)
				)
			)
		);

		return yargs
			.command(SSHCommand)
			.command(RegistriesCommand)
			.showHelpOnFail(true)
			.demandCommand();
	},
};
