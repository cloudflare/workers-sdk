/* eslint-disable no-shadow */

import * as Build from "./build";
import * as BuildEnv from "./build-env";
import * as Deploy from "./deploy";
import * as DeploymentTails from "./deployment-tails";
import * as Deployments from "./deployments";
import * as Dev from "./dev";
import * as DownloadConfig from "./download-config";
import * as Functions from "./functions";
import * as Projects from "./projects";
import { secret } from "./secret";
import * as Upload from "./upload";
import { CLEANUP } from "./utils";
import * as Validate from "./validate";
import type { CommonYargsArgv, SubHelp } from "../yargs-types";

process.on("SIGINT", () => {
	CLEANUP();
	process.exit();
});
process.on("SIGTERM", () => {
	CLEANUP();
	process.exit();
});

export function pages(yargs: CommonYargsArgv, subHelp: SubHelp) {
	return (
		yargs
			.command(subHelp)
			.command(
				"dev [directory] [-- command..]",
				"Develop your full-stack Pages application locally",
				Dev.Options,
				Dev.Handler
			)
			/**
			 * `wrangler pages functions` is meant for internal use only for now,
			 * so let's hide this command from the help output
			 */
			.command("functions", false, (args) =>
				args
					.command(subHelp)
					.command(
						"build [directory]",
						"Compile a folder of Cloudflare Pages Functions into a single Worker",
						Build.Options,
						Build.Handler
					)
					.command(
						"build-env [projectDir]",
						"Render a list of environment variables from the config file",
						BuildEnv.Options,
						BuildEnv.Handler
					)
					.command(
						"optimize-routes [routesPath] [outputRoutesPath]",
						"Consolidate and optimize the route paths declared in _routes.json",
						Functions.OptimizeRoutesOptions,
						Functions.OptimizeRoutesHandler
					)
			)
			.command("project", "Interact with your Pages projects", (args) =>
				args
					.command(subHelp)
					.command(
						"list",
						"List your Cloudflare Pages projects",
						Projects.ListOptions,
						Projects.ListHandler
					)
					.command(
						"create [project-name]",
						"Create a new Cloudflare Pages project",
						Projects.CreateOptions,
						Projects.CreateHandler
					)
					.command(
						"delete [project-name]",
						"Delete a Cloudflare Pages project",
						Projects.DeleteOptions,
						Projects.DeleteHandler
					)
					.command("upload [directory]", false, Upload.Options, Upload.Handler)
					.command(
						"validate [directory]",
						false,
						Validate.Options,
						Validate.Handler
					)
			)
			.command(
				"deployment",
				"Interact with the deployments of a project",
				(args) =>
					args
						.command(subHelp)
						.command(
							"list",
							"List deployments in your Cloudflare Pages project",
							Deployments.ListOptions,
							Deployments.ListHandler
						)
						.command(
							"create [directory]",
							"Publish a directory of static assets as a Pages deployment",
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
				"Deploy a directory of static assets as a Pages deployment",
				Deploy.Options,
				Deploy.Handler
			)
			.command(
				"secret",
				"Generate a secret that can be referenced in a Pages project",
				(secretYargs) => secret(secretYargs, subHelp)
			)
			.command("download", "Download settings from your project", (args) =>
				args.command(
					"config [projectName]",
					"Experimental: Download your Pages project config as a Wrangler configuration file",
					DownloadConfig.Options,
					DownloadConfig.Handler
				)
			)
	);
}
