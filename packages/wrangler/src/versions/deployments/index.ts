import {
	versionsDeploymentsListHandler,
	versionsDeploymentsListOptions,
} from "./list";
import {
	versionsDeploymentsStatusHandler,
	versionsDeploymentsStatusOptions,
} from "./status";
import {
	versionsDeploymentsViewHandler,
	versionsDeploymentsViewOptions,
} from "./view";
import type { CommonYargsArgv } from "../../yargs-types";

export default function registerVersionsDeploymentsSubcommands(
	versionDeploymentsYargs: CommonYargsArgv
) {
	versionDeploymentsYargs
		.command(
			"list",
			"Displays the 10 most recent deployments of your Worker",
			versionsDeploymentsListOptions,
			versionsDeploymentsListHandler
		)
		.command(
			"status",
			"View the current state of your production",
			versionsDeploymentsStatusOptions,
			versionsDeploymentsStatusHandler
		)
		.command(
			"view [deployment-id]",
			false,
			versionsDeploymentsViewOptions,
			versionsDeploymentsViewHandler
		);
}
