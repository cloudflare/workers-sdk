import { DeprecationError } from "./errors";
import type { Argv, ArgumentsCamelCase } from "yargs";

interface GenerateArgs {
	name: string;
	template: string;
}

export function generateOptions(yargs: Argv) {
	return yargs
		.positional("name", {
			describe: "Name of the Workers project",
			default: "worker",
		})
		.positional("template", {
			describe: "The URL of a GitHub template",
			default: "https://github.com/cloudflare/worker-template",
		});
}

export function generateHandler(
	generateArgs: ArgumentsCamelCase<GenerateArgs>
) {
	// "👯 [DEPRECATED]. Scaffold a Cloudflare Workers project from a public GitHub repository.",
	throw new DeprecationError(
		"`wrangler generate` has been deprecated.\n" +
			"Try running `wrangler init` to generate a basic Worker, or cloning the template repository instead:\n\n" +
			"```\n" +
			`git clone ${generateArgs.template}\n` +
			"```\n\n" +
			"Please refer to https://developers.cloudflare.com/workers/wrangler/deprecations/#generate for more information."
	);
}
