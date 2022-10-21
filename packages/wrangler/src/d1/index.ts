import * as Backups from "./backups";
import * as Create from "./create";
import * as Delete from "./delete";
import * as Execute from "./execute";
import * as List from "./list";
import { d1BetaWarning } from "./utils";
import type { Argv } from "yargs";

export const d1 = (yargs: Argv) => {
	return (
		yargs
			.command("list", "List D1 databases", List.Options, List.Handler)
			.command(
				"create <name>",
				"Create D1 database",
				Create.Options,
				Create.Handler
			)
			.command(
				"delete <name>",
				"Delete D1 database",
				Delete.Options,
				Delete.Handler
			)
			.command("backup", "Interact with D1 Backups", (yargs2) =>
				yargs2
					.command(
						"list <name>",
						"List your D1 backups",
						Backups.ListOptions,
						Backups.ListHandler
					)
					.command(
						"create <name>",
						"Create a new D1 backup",
						Backups.CreateOptions,
						Backups.CreateHandler
					)
					.command(
						"restore <name> <backup-id>",
						"Restore a DB backup",
						Backups.RestoreOptions,
						Backups.RestoreHandler
					)
					.command(
						"download <name> <backup-id>",
						"Download a DB backup",
						Backups.DownloadOptions,
						Backups.DownloadHandler
					)
					.epilogue(d1BetaWarning)
			)
			// .command(
			//   "console <name>",
			//   "Open a Console on a D1 database",
			//   (d1CreateYargs) => {
			//     return d1CreateYargs.positional("name", {
			//       describe: "The name of the DB",
			//       type: "string",
			//       demandOption: true,
			//     });
			//   },
			//   async (_) => {
			//     // TODO
			//   }
			// )
			.command(
				"execute <name>",
				"Executed command or SQL file",
				Execute.Options,
				Execute.Handler
			)
			.epilogue(d1BetaWarning)
	);
};
