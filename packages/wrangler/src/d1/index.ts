import * as Create from "./create";
import * as Delete from "./delete";
import * as Execute from "./execute";
import * as Export from "./export";
import * as Info from "./info";
import * as Insights from "./insights";
import * as List from "./list";
import * as Migrations from "./migrations";
import * as TimeTravel from "./timeTravel";
import type { CommonYargsArgv } from "../yargs-types";

export function d1(yargs: CommonYargsArgv) {
	return (
		yargs
			.command("list", "List D1 databases", List.Options, List.Handler)
			.command(
				"info <name>",
				"Get information about a D1 database, including the current database size and state",
				Info.Options,
				Info.Handler
			)
			.command(
				"insights <name>",
				"Experimental command. Get information about the queries run on a D1 database.",
				Insights.Options,
				Insights.Handler
			)
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
				"execute <database>",
				"Execute a command or SQL file",
				Execute.Options,
				Execute.Handler
			)
			.command(
				"export <name>",
				"Export the contents or schema of your database as a .sql file",
				Export.Options,
				Export.Handler
			)
			.command(
				"time-travel",
				"Use Time Travel to restore, fork or copy a database at a specific point-in-time",
				(yargs2) =>
					yargs2
						.demandCommand()
						.command(
							"info <database>",
							"Retrieve information about a database at a specific point-in-time using Time Travel",
							TimeTravel.InfoOptions,
							TimeTravel.InfoHandler
						)
						.command(
							"restore <database>",
							"Restore a database back to a specific point-in-time",
							TimeTravel.RestoreOptions,
							TimeTravel.RestoreHandler
						)
			)
			.command("migrations", "Interact with D1 migrations", (yargs2) =>
				yargs2
					.demandCommand()
					.command(
						"list <database>",
						"List your D1 migrations",
						Migrations.ListOptions,
						Migrations.ListHandler
					)
					.command(
						"create <database> <message>",
						"Create a new migration",
						Migrations.CreateOptions,
						Migrations.CreateHandler
					)
					.command(
						"apply <database>",
						"Apply D1 migrations",
						Migrations.ApplyOptions,
						Migrations.ApplyHandler
					)
			)
	);
}
