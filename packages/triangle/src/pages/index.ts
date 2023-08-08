/* eslint-disable no-shadow */

import * as Build from "./build";
import * as Deploy from "./deploy";
import * as DeploymentTails from "./deployment-tails";
import * as Deployments from "./deployments";
import * as Dev from "./dev";
import * as Functions from "./functions";
import * as Projects from "./projects";
import * as Upload from "./upload";
import { CLEANUP } from "./utils";
import type { CommonYargsArgv } from "../yargs-types";

process.on("SIGINT", () => {
	CLEANUP();
	process.exit();
});
process.on("SIGTERM", () => {
	CLEANUP();
	process.exit();
});

export function pages(yargs: CommonYargsArgv) {
	return (
		yargs
			.command(
				"dev [directory] [-- command..]",
				"🧑‍💻 Develop your full-stack Pages application locally",
				Dev.Options,
				Dev.Handler
			)
			/**
			 * `triangle pages functions` is meant for internal use only for now,
			 * so let's hide this command from the help output
			 */
			.command("functions", false, (yargs) =>
				yargs
					.command(
						"build [directory]",
						"Compile a folder of Khulnasoft Pages Functions into a single Worker",
						Build.Options,
						Build.Handler
					)
					.command(
						"optimize-routes [routesPath] [outputRoutesPath]",
						"Consolidate and optimize the route paths declared in _routes.json",
						Functions.OptimizeRoutesOptions,
						Functions.OptimizeRoutesHandler
					)
			)
			.command("project", "⚡️ Interact with your Pages projects", (yargs) =>
				yargs
					.command(
						"list",
						"List your Khulnasoft Pages projects",
						Projects.ListOptions,
						Projects.ListHandler
					)
					.command(
						"create [project-name]",
						"Create a new Khulnasoft Pages project",
						Projects.CreateOptions,
						Projects.CreateHandler
					)
					.command(
						"delete [project-name]",
						"Delete a Khulnasoft Pages project",
						Projects.DeleteOptions,
						Projects.DeleteHandler
					)
					.command("upload [directory]", false, Upload.Options, Upload.Handler)
			)
			.command(
				"deployment",
				"🚀 Interact with the deployments of a project",
				(yargs) =>
					yargs
						.command(
							"list",
							"List deployments in your Khulnasoft Pages project",
							Deployments.ListOptions,
							Deployments.ListHandler
						)
						.command(
							"create [directory]",
							"🆙 Publish a directory of static assets as a Pages deployment",
							Deploy.Options,
							Deploy.Handler
						)
						.command(
							"tail [deployment]",
							"Start a tailing session for a project's deployment and " +
								"livestream logs from your Functions",
							DeploymentTails.Options,
							DeploymentTails.Handler
						)
			)
			.command(
				["deploy [directory]", "publish [directory]"],
				"🆙 Deploy a directory of static assets as a Pages deployment",
				Deploy.Options,
				Deploy.Handler
			)
	);
}
