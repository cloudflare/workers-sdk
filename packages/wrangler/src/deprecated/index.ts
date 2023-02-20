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
			text: "Deprecation: `wrangler build` has been deprecated.",
			notes: [
				{
					text: "Please refer to https://developers.cloudflare.com/workers/wrangler/migration/deprecations/#build for more information.",
				},
				{
					text: `Attempting to run \`wrangler publish --dry-run --outdir=dist${envFlag}\` for you instead:`,
				},
			],
		})
	);

	await createCLIParser([
		"publish",
		"--dry-run",
		"--outdir=dist",
		...(buildArgs.env ? ["--env", buildArgs.env] : []),
	]).parse();
}

export const noOpOptions = () => {};
export const configHandler = () => {
	// "🕵️  Authenticate Wrangler with a Cloudflare API Token",
	throw new DeprecationError(
		"`wrangler config` has been deprecated, please refer to https://developers.cloudflare.com/workers/wrangler/migration/deprecations/#config for alternatives"
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
		"The `wrangler preview` command has been deprecated.\n" +
			"Try using `wrangler dev` to to try out a worker during development.\n"
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
				// "👯 [DEPRECATED]. Use wrangler.toml to manage routes.
				const deprecationNotice = "`wrangler route list` has been deprecated.";
				const futureRoutes =
					"Refer to wrangler.toml for a list of routes the worker will be deployed to upon publishing.";
				const presentRoutes =
					"Refer to the Cloudflare Dashboard to see the routes this worker is currently running on.";
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
				// "👯 [DEPRECATED]. Use wrangler.toml to manage routes.
				const deprecationNotice =
					"`wrangler route delete` has been deprecated.";
				const shouldDo =
					"Remove the unwanted route(s) from wrangler.toml and run `wrangler publish` to remove your worker from those routes.";
				throw new DeprecationError(`${deprecationNotice}\n${shouldDo}`);
			}
		);
};

export const routeHandler = () => {
	// "[DEPRECATED]. Use wrangler.toml to manage routes.
	const deprecationNotice = "`wrangler route` has been deprecated.";
	const shouldDo =
		"Please use wrangler.toml and/or `wrangler publish --routes` to modify routes";
	throw new DeprecationError(`${deprecationNotice}\n${shouldDo}`);
};

export const subdomainOptions = (yargs: CommonYargsArgv) => {
	return yargs.positional("name", { type: "string" });
};

export const subdomainHandler = () => {
	throw new DeprecationError(
		"`wrangler subdomain` has been deprecated, please refer to https://developers.cloudflare.com/workers/wrangler/migration/deprecations/#subdomain for alternatives"
	);
};
