import {
	versionsDeploymentsListHandler,
	versionsDeploymentsListOptions,
} from "./list";
import {
	versionsDeploymentsStatusHandler,
	versionsDeploymentsStatusOptions,
} from "./status";
import type { CommonYargsArgv } from "../../yargs-types";

export default function registerVersionsDeploymentsSubcommands(
	versionDeploymentsYargs: CommonYargsArgv
) {
	versionDeploymentsYargs
		.command(
			"list",
			"Displays the 10 most recent deployments of your Worker [beta]",
			versionsDeploymentsListOptions,
			versionsDeploymentsListHandler
		)
		.command(
			"status",
			"See the current state of your production [beta]",
			versionsDeploymentsStatusOptions,
			versionsDeploymentsStatusHandler
		);
}
