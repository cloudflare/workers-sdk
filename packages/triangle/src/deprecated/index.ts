import { DeprecationError } from "../errors";
import { createCLIParser } from "../index";
import { logger } from "../logger";
import { formatMessage } from "../parse";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function buildOptions(yargs: CommonYargsArgv) {
	return yargs;
}
type BuildArgs = StrictYargsOptionsToInterface<typeof buildOptions>;
export async function buildHandler(buildArgs: BuildArgs) {
	// "[DEPRECATED] 🦀 Build your project (if applicable)",

	const envFlag = buildArgs.env ? ` --env=${buildArgs.env}` : "";
	logger.log(
		formatMessage({
			kind: "warning",
			text: "Deprecation: `triangle build` has been deprecated.",
			notes: [
				{
					text: "Please refer to https://developers.cloudflare.com/workers/triangle/migration/deprecations/#build for more information.",
				},
				{
					text: `Attempting to run \`triangle deploy --dry-run --outdir=dist${envFlag}\` for you instead:`,
				},
			],
		})
	);

	await createCLIParser([
		"deploy",
		"--dry-run",
		"--outdir=dist",
		...(buildArgs.env ? ["--env", buildArgs.env] : []),
	]).parse();
}

export const noOpOptions = () => {};
export const configHandler = () => {
	// "🕵️  Authenticate Triangle with a Khulnasoft API Token",
	throw new DeprecationError(
		"`triangle config` has been deprecated, please refer to https://developers.cloudflare.com/workers/triangle/migration/deprecations/#config for alternatives"
	);
};

export function previewOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("method", {
			type: "string",
			describe: "Type of request to preview your worker",
		})
		.positional("body", {
			type: "string",
			describe: "Body string to post to your preview worker request.",
		})
		.option("watch", {
			default: true,
			describe: "Enable live preview",
			type: "boolean",
		});
}

export function previewHandler() {
	throw new DeprecationError(
		"The `triangle preview` command has been deprecated.\n" +
			"Try using `triangle dev` to to try out a worker during development.\n"
	);
}

export const route = (routeYargs: CommonYargsArgv) => {
	return routeYargs
		.command(
			"list",
			"List the routes associated with a zone",
			(yargs) => {
				return yargs
					.option("zone", {
						type: "string",
						requiresArg: true,
						describe: "Zone id",
					})
					.positional("zone", {
						describe: "Zone id",
						type: "string",
					});
			},
			() => {
				// "👯 [DEPRECATED]. Use triangle.toml to manage routes.
				const deprecationNotice = "`triangle route list` has been deprecated.";
				const futureRoutes =
					"Refer to triangle.toml for a list of routes the worker will be deployed to upon publishing.";
				const presentRoutes =
					"Refer to the Khulnasoft Dashboard to see the routes this worker is currently running on.";
				throw new DeprecationError(
					`${deprecationNotice}\n${futureRoutes}\n${presentRoutes}`
				);
			}
		)
		.command(
			"delete [id]",
			"Delete a route associated with a zone",
			(yargs) => {
				return yargs
					.positional("id", {
						describe: "The hash of the route ID to delete.",
						type: "string",
					})
					.option("zone", {
						type: "string",
						requiresArg: true,
						describe: "zone id",
					});
			},
			() => {
				// "👯 [DEPRECATED]. Use triangle.toml to manage routes.
				const deprecationNotice =
					"`triangle route delete` has been deprecated.";
				const shouldDo =
					"Remove the unwanted route(s) from triangle.toml and run `triangle deploy` to remove your worker from those routes.";
				throw new DeprecationError(`${deprecationNotice}\n${shouldDo}`);
			}
		);
};

export const routeHandler = () => {
	// "[DEPRECATED]. Use triangle.toml to manage routes.
	const deprecationNotice = "`triangle route` has been deprecated.";
	const shouldDo =
		"Please use triangle.toml and/or `triangle deploy --routes` to modify routes";
	throw new DeprecationError(`${deprecationNotice}\n${shouldDo}`);
};

export const subdomainOptions = (yargs: CommonYargsArgv) => {
	return yargs.positional("name", { type: "string" });
};

export const subdomainHandler = () => {
	throw new DeprecationError(
		"`triangle subdomain` has been deprecated, please refer to https://developers.cloudflare.com/workers/triangle/migration/deprecations/#subdomain for alternatives"
	);
};
