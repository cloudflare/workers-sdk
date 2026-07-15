import { statSync } from "node:fs";
import { UserError } from "@cloudflare/workers-utils";
import { logger } from "../logger";
import type { NamedArgDefinitions } from "../core/types";

export const sharedDeployVersionsArgs = {
	path: {
		describe:
			"The path to an entry point for your Worker or a directory of static assets",
		type: "string",
	},
	// The `path` positional replaces `script`. `--script` still works as a named
	// option for backwards compatibility but only accepts file paths (not directories).
	script: {
		describe: "The path to an entry point for your Worker",
		type: "string",
		requiresArg: true,
		hidden: true,
		deprecated: true,
	},
	name: {
		describe: "Name of the Worker",
		type: "string",
		requiresArg: true,
	},
	tag: {
		describe: "A tag for this Worker Version",
		type: "string",
		requiresArg: true,
	},
	message: {
		describe: "A descriptive message for this Worker Version",
		type: "string",
		requiresArg: true,
	},
	// We want to have a --no-bundle flag, but yargs requires that
	// we also have a --bundle flag (that it adds the --no to by itself)
	// So we make a --bundle flag, but hide it, and then add a --no-bundle flag
	// that's visible to the user but doesn't "do" anything.
	bundle: {
		describe: "Run Wrangler's compilation step before publishing",
		type: "boolean",
		hidden: true,
	},
	"no-bundle": {
		describe: "Skip internal build steps and directly upload Worker",
		type: "boolean",
		default: false,
	},
	outdir: {
		describe: "Output directory for the bundled Worker",
		type: "string",
		requiresArg: true,
	},
	outfile: {
		describe: "Output file for the bundled worker",
		type: "string",
		requiresArg: true,
	},
	"compatibility-date": {
		describe: "Date to use for compatibility checks",
		type: "string",
		requiresArg: true,
	},
	"compatibility-flags": {
		describe: "Flags to use for compatibility checks",
		alias: "compatibility-flag",
		type: "string",
		requiresArg: true,
		array: true,
	},
	latest: {
		describe: "Use the latest version of the Workers runtime",
		type: "boolean",
		default: false,
	},
	assets: {
		describe: "Static assets to be served. Replaces Workers Sites.",
		type: "string",
		requiresArg: true,
	},
	site: {
		describe: "Root folder of static assets for Workers Sites",
		type: "string",
		requiresArg: true,
		hidden: true,
		deprecated: true,
	},
	"site-include": {
		describe:
			"Array of .gitignore-style patterns that match file or directory names from the sites directory. Only matched items will be uploaded.",
		type: "string",
		requiresArg: true,
		array: true,
		hidden: true,
		deprecated: true,
	},
	"site-exclude": {
		describe:
			"Array of .gitignore-style patterns that match file or directory names from the sites directory. Matched items will not be uploaded.",
		type: "string",
		requiresArg: true,
		array: true,
		hidden: true,
		deprecated: true,
	},
	var: {
		describe: "A key-value pair to be injected into the script as a variable",
		type: "string",
		requiresArg: true,
		array: true,
	},
	define: {
		describe: "A key-value pair to be substituted in the script",
		type: "string",
		requiresArg: true,
		array: true,
	},
	alias: {
		describe: "A module pair to be substituted in the script",
		type: "string",
		requiresArg: true,
		array: true,
	},
	"jsx-factory": {
		describe: "The function that is called for each JSX element",
		type: "string",
		requiresArg: true,
	},
	"jsx-fragment": {
		describe: "The function that is called for each JSX fragment",
		type: "string",
		requiresArg: true,
	},
	tsconfig: {
		describe: "Path to a custom tsconfig.json file",
		type: "string",
		requiresArg: true,
	},
	minify: {
		describe: "Minify the Worker",
		type: "boolean",
	},
	"upload-source-maps": {
		describe: "Include source maps when uploading this Worker",
		type: "boolean",
	},
	"node-compat": {
		describe: "Enable Node.js compatibility",
		type: "boolean",
		hidden: true,
		deprecated: true,
	},
	"dry-run": {
		describe:
			"Compile a project and run checks without actually uploading the Worker",
		type: "boolean",
	},
	"secrets-file": {
		describe:
			"Path to a file containing secrets to upload with the version (JSON or .env format). Applies additively with secrets from previous deployments - omitted secrets will not be deleted.",
		type: "string",
		requiresArg: true,
	},
	"keep-vars": {
		describe:
			"When not used (or set to false), Wrangler will delete all vars before setting those found in the Wrangler configuration.\n" +
			"When used (and set to true), the environment variables are not deleted before the deployment.\n" +
			"If you set variables via the dashboard you probably want to use this flag.\n" +
			"Note that secrets are never deleted by deployments.",
		default: false,
		type: "boolean",
	},
	"experimental-auto-create": {
		describe: "Automatically provision draft bindings with new resources",
		type: "boolean",
		default: true,
		hidden: true,
		alias: "x-auto-create",
	},
	"experimental-deploy-helpers": {
		describe: "Experimental: Gates refactored deploy/upload path",
		type: "boolean",
		default: false,
		hidden: true,
		alias: ["x-deploy-helpers"],
	},
	strict: {
		describe:
			"Enables strict mode, which prevents uploads when there are conflicting remote changes.",
		type: "boolean",
		default: false,
	},
} as const satisfies NamedArgDefinitions;

/**
 * Validates and resolves shared arguments for `wrangler deploy` and `wrangler versions upload`.
 *
 * Resolves the `path` positional into `script` (file) or `assets` (directory),
 * validates that `--script` does not point to a directory, and checks deprecated flags.
 *
 * @param args - The parsed CLI arguments to validate and mutate.
 * @param commandName - The CLI command name (e.g. `"deploy"` or `"versions upload"`)
 *   used in error messages and suggestions.
 */
export function validateDeployVersionsArgs(
	args: {
		path: string | undefined;
		script: string | undefined;
		assets: string | undefined;
		nodeCompat: boolean | undefined;
		latest: boolean | undefined;
	},
	commandName: "deploy" | "versions upload"
): void {
	// Capture the original --script value before resolving the positional path,
	// so we can validate it independently even after args.script is overwritten.
	const originalScript = args.script;

	// Resolve the `path` positional into `script` (file) or `assets` (directory).
	// This must happen before config is read because config resolution uses
	// `args.script` to locate the wrangler config file relative to the entry point.
	if (args.path) {
		try {
			const stats = statSync(args.path);
			if (stats.isDirectory()) {
				if (!args.assets) {
					args.assets = args.path;
				}
			} else {
				args.script = args.path;
			}
		} catch {
			// If stat fails, assume it's a script path and let downstream handle the error
			args.script = args.path;
		}
	}

	// Validate that --script points to a file, not a directory.
	// Use the original --script value (before the positional path may have
	// overwritten it) so directory validation is never silently bypassed.
	if (originalScript) {
		try {
			const stats = statSync(originalScript);
			if (stats.isDirectory()) {
				throw new UserError(
					`The --script option must point to a Worker entry-point file, not a directory. To deploy a directory of static assets, use the positional path argument or the --assets flag instead:\n  wrangler ${commandName} ${originalScript}\n  wrangler ${commandName} --assets ${originalScript}`,
					{
						telemetryMessage: `${commandName} script option pointed to directory`,
					}
				);
			}
		} catch (e) {
			if (e instanceof UserError) {
				throw e;
			}
			// stat failure is fine, downstream will handle missing files
		}
	}

	if (args.nodeCompat) {
		throw new UserError(
			"The --node-compat flag is no longer supported as of Wrangler v4. Instead, use the `nodejs_compat` compatibility flag. This includes the functionality from legacy `node_compat` polyfills and natively implemented Node.js APIs. See https://developers.cloudflare.com/workers/runtime-apis/nodejs for more information.",
			{ telemetryMessage: "deploy node compat unsupported" }
		);
	}

	if (args.latest) {
		logger.warn(
			`Using the latest version of the Workers runtime. To silence this warning, please choose a specific version of the runtime with --compatibility-date, or add a compatibility_date to your configuration file.`
		);
	}
}
