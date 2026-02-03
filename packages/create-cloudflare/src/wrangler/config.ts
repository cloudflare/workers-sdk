import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { getWorkerdCompatibilityDate } from "helpers/compatDate";
import { readFile, writeFile, writeJSON } from "helpers/files";
import {
	addJSONComment,
	appendJSONProperty,
	insertJSONProperty,
	readJSONWithComments,
	writeJSONWithComments,
} from "helpers/json";
import TOML from "smol-toml";
import type { CommentObject, Reviver } from "comment-json";
import type { TomlTable } from "smol-toml";
import type { C3Context } from "types";

/**
 * Update the `wrangler.(toml|json|jsonc)` file for this project by:
 *
 * - setting the `name` to the passed project name
 * - adding the latest compatibility date when no valid one is present
 * - enabling observability
 * - adding `nodejs_compat` to the compatibility flags (if not already present)
 * - adding comments with links to documentation for common configuration options
 * - substituting placeholders with actual values
 *   - `<WORKER_NAME>` with the project name
 *   - `<COMPATIBILITY_DATE>` with the max compatibility date of the installed worked
 *
 * If both `wrangler.toml` and `wrangler.json`/`wrangler.jsonc` are present, only
 * the `wrangler.json`/`wrangler.jsonc` file will be updated.
 */
export const updateWranglerConfig = async (ctx: C3Context) => {
	// Placeholders to replace in the wrangler config files
	const substitutions: Record<string, string> = {
		"<WORKER_NAME>": ctx.project.name,
		"<COMPATIBILITY_DATE>": getWorkerdCompatibilityDate(ctx.project.path),
	};

	if (wranglerJsonOrJsoncExists(ctx)) {
		let wranglerJson = readWranglerJsonOrJsonc(ctx, (_key, value) => {
			if (typeof value !== "string") {
				return value;
			}
			let result = value;
			for (const [placeholder, substitution] of Object.entries(substitutions)) {
				result = result.replaceAll(placeholder, substitution);
			}
			return result;
		});

		// Put the schema at the top of the file
		wranglerJson = insertJSONProperty(
			wranglerJson,
			"$schema",
			"node_modules/wrangler/config-schema.json",
		);

		wranglerJson = appendJSONProperty(wranglerJson, "name", ctx.project.name);
		wranglerJson = appendJSONProperty(
			wranglerJson,
			"compatibility_date",
			await getCompatibilityDate(
				wranglerJson.compatibility_date,
				ctx.project.path,
			),
		);
		wranglerJson = appendJSONProperty(wranglerJson, "observability", {
			enabled: true,
		});
		// Skip adding nodejs_compat for Python projects since it's not compatible with Python workers
		if (ctx.args.lang !== "python") {
			wranglerJson = addNodejsCompatFlag(wranglerJson);
		}

		addHintsAsJsonComments(wranglerJson);

		writeWranglerJsonOrJsonc(ctx, wranglerJson);
		addVscodeConfig(ctx);
	} else if (wranglerTomlExists(ctx)) {
		let strToml = readWranglerToml(ctx);

		for (const [key, value] of Object.entries(substitutions)) {
			strToml = strToml.replaceAll(key, value);
		}

		const wranglerToml = TOML.parse(strToml);
		wranglerToml.name = ctx.project.name;
		wranglerToml.compatibility_date = await getCompatibilityDate(
			wranglerToml.compatibility_date,
			ctx.project.path,
		);
		wranglerToml.observability ??= { enabled: true };
		// Skip adding nodejs_compat for Python projects since it's not compatible with Python workers
		if (ctx.args.lang !== "python") {
			addNodejsCompatFlagToToml(wranglerToml);
		}

		writeWranglerToml(
			ctx,
			`#:schema node_modules/wrangler/config-schema.json
# For more details on how to configure Wrangler, refer to:\n# https://developers.cloudflare.com/workers/wrangler/configuration/
${TOML.stringify(wranglerToml)}
${generateHintsAsTomlComments(wranglerToml)}
`,
		);
	}
};

const getWranglerTomlPath = (ctx: C3Context) => {
	return resolve(ctx.project.path, "wrangler.toml");
};

const getWranglerJsonPath = (ctx: C3Context) => {
	return resolve(ctx.project.path, "wrangler.json");
};

const getWranglerJsoncPath = (ctx: C3Context) => {
	return resolve(ctx.project.path, "wrangler.jsonc");
};

export const wranglerTomlExists = (ctx: C3Context) => {
	const wranglerTomlPath = getWranglerTomlPath(ctx);
	return existsSync(wranglerTomlPath);
};

/** Checks for an existing `wrangler.json` or `wrangler.jsonc` */
export const wranglerJsonOrJsoncExists = (ctx: C3Context) => {
	const wranglerJsonPath = getWranglerJsonPath(ctx);
	const wranglerJsoncPath = getWranglerJsoncPath(ctx);
	return existsSync(wranglerJsonPath) || existsSync(wranglerJsoncPath);
};

export const readWranglerToml = (ctx: C3Context) => {
	const wranglerTomlPath = getWranglerTomlPath(ctx);
	return readFile(wranglerTomlPath);
};

/**
 * Reads the JSON configuration file for this project.
 *
 * If both `wrangler.json` and `wrangler.jsonc` are present, `wrangler.json` will be read.
 *
 * @param ctx The C3 context.
 * @param reviver A function that transforms the results. This function is called for each member of the object.
 * @returns The parsed JSON object with comments.
 */
export const readWranglerJsonOrJsonc = (
	ctx: C3Context,
	reviver?: Reviver,
): CommentObject => {
	const wranglerJsonPath = getWranglerJsonPath(ctx);
	if (existsSync(wranglerJsonPath)) {
		return readJSONWithComments(wranglerJsonPath, reviver);
	}
	const wranglerJsoncPath = getWranglerJsoncPath(ctx);
	return readJSONWithComments(wranglerJsoncPath, reviver);
};

export const writeWranglerToml = (ctx: C3Context, contents: string) => {
	const wranglerTomlPath = getWranglerTomlPath(ctx);
	return writeFile(wranglerTomlPath, contents);
};

/**
 * Writes the passed JSON object as the configuration file for this project.
 *
 * If there is an existing `wrangler.json` file, it will be overwritten.
 * If not, `wrangler.jsonc` will be created/overwritten.
 *
 * @param ctx The C3 context.
 * @param config The JSON object (with comment properties) to write.
 */
const writeWranglerJsonOrJsonc = (ctx: C3Context, config: CommentObject) => {
	const wranglerJsonPath = getWranglerJsonPath(ctx);
	if (existsSync(wranglerJsonPath)) {
		return writeJSONWithComments(wranglerJsonPath, config);
	}
	const wranglerJsoncPath = getWranglerJsoncPath(ctx);
	return writeJSONWithComments(wranglerJsoncPath, config);
};

export const addVscodeConfig = (ctx: C3Context) => {
	const settingsPath = `${ctx.project.path}/.vscode/settings.json`;

	// don't override a user's existing settings
	// as this is just a quick stop gap we'll just not bother if the file exists
	if (existsSync(settingsPath)) {
		return;
	}

	mkdirSync(`${ctx.project.path}/.vscode`, { recursive: true });

	writeJSON(settingsPath, {
		"files.associations": {
			"wrangler.json": "jsonc",
		},
	});
};

/**
 * Gets the compatibility date to use.
 *
 * If the tentative date is valid, it is returned. Otherwise the latest workerd date is used.
 *
 * @param tentativeDate A tentative compatibility date, usually from wrangler config.
 * @param projectPath The path to the target project.
 * @returns The compatibility date to use in the form "YYYY-MM-DD".
 */
async function getCompatibilityDate(
	tentativeDate: unknown,
	projectPath: string,
): Promise<string> {
	if (
		typeof tentativeDate === "string" &&
		/^\d{4}-\d{2}-\d{2}$/.test(tentativeDate)
	) {
		// Use the tentative date when it is valid.
		// It may be there for a specific compat reason
		return tentativeDate;
	}
	// Fallback to the latest workerd date
	return getWorkerdCompatibilityDate(projectPath);
}

/**
 * Common configuration hints to add as comments to wrangler configs.
 */
const hints: Record<string, { value?: unknown; comment: string }> = {
	placement: {
		value: { mode: "smart" },
		comment: `Smart Placement
https://developers.cloudflare.com/workers/configuration/smart-placement/#smart-placement`,
	},
	bindings: {
		comment: `Bindings
Bindings allow your Worker to interact with resources on the Cloudflare Developer Platform, including
databases, object storage, AI inference, real-time communication and more.
https://developers.cloudflare.com/workers/runtime-apis/bindings/`,
	},
	vars: {
		value: { MY_VARIABLE: "production_value" },
		comment: `Environment Variables
https://developers.cloudflare.com/workers/wrangler/configuration/#environment-variables
Note: Use secrets to store sensitive data.
https://developers.cloudflare.com/workers/configuration/secrets/`,
	},
	assets: {
		value: { directory: "./public/", binding: "ASSETS" },
		comment: `Static Assets
https://developers.cloudflare.com/workers/static-assets/binding/`,
	},
	services: {
		value: [{ binding: "MY_SERVICE", service: "my-service" }],
		comment: `Service Bindings (communicate between multiple Workers)
https://developers.cloudflare.com/workers/wrangler/configuration/#service-bindings`,
	},
};

/**
 * Adds comments with hints for common configuration options to a JSON wrangler config.
 *
 * Note: existing properties in the config will not receive hints.
 *
 * @param wranglerConfig The wrangler JSON configuration object to add comments to.
 */
function addHintsAsJsonComments(wranglerConfig: CommentObject) {
	addJSONComment(
		wranglerConfig,
		"before-all",
		"*\n * For more details on how to configure Wrangler, refer to:\n * https://developers.cloudflare.com/workers/wrangler/configuration/\n ",
	);

	const commentsToAdd = [];

	for (const [key, hint] of Object.entries(hints)) {
		// Only add hints for properties not already present in the config
		if (!(key in wranglerConfig)) {
			// Add block comment with the hint description
			commentsToAdd.push(
				`*\n\t * ${hint.comment.split("\n").join("\n\t * ")}\n\t `,
			);

			// Add line comment with the example value
			if (hint.value) {
				commentsToAdd.push({
					type: "LineComment" as const,
					value: JSON.stringify({ [key]: hint.value }, null, 1)
						.replaceAll("\n", "")
						.slice(1, -1),
				});
			}
		}
	}

	if (commentsToAdd.length > 0) {
		addJSONComment(wranglerConfig, "after", commentsToAdd);
	}
}

/**
 * Generates TOML comments with hints for common configuration options.
 *
 * Note: existing properties in the config will not receive hints.
 *
 * @param wranglerConfig The wrangler TOML configuration.
 * @returns The generated TOML comments as a string.
 */
function generateHintsAsTomlComments(wranglerConfig: TomlTable): string {
	const commentLines: string[] = [];

	for (const [key, hint] of Object.entries(hints)) {
		// Only add hints for properties not already present in the config
		if (!(key in wranglerConfig)) {
			// Add block comment with the hint description
			commentLines.push(`# ${hint.comment.split("\n").join("\n# ")}`);

			// Add line comment with the example value
			if (hint.value) {
				commentLines.push(
					TOML.stringify({ [key]: hint.value })
						.trimEnd()
						.split("\n")
						.map((line) => `# ${line}`)
						.join("\n"),
				);
			}

			commentLines.push(""); // Add an empty line after each hint for readability
		}
	}

	return commentLines.join("\n");
}

/**
 * Adds the `nodejs_compat` flag to the `compatibility_flags` array in a JSON wrangler config.
 * If the array doesn't exist, it will be created. If `nodejs_compat`, `nodejs_compat_v2`,
 * or `no_nodejs_compat` is already present, no changes are made.
 *
 * @param wranglerConfig The wrangler JSON configuration object.
 * @returns The updated configuration object.
 */
function addNodejsCompatFlag(wranglerConfig: CommentObject): CommentObject {
	const existingFlags = Array.isArray(wranglerConfig.compatibility_flags)
		? (wranglerConfig.compatibility_flags as string[])
		: [];

	if (
		existingFlags.includes("nodejs_compat") ||
		existingFlags.includes("nodejs_compat_v2") ||
		existingFlags.includes("no_nodejs_compat")
	) {
		return wranglerConfig;
	}

	return appendJSONProperty(wranglerConfig, "compatibility_flags", [
		"nodejs_compat",
		...existingFlags,
	]);
}

/**
 * Adds the `nodejs_compat` flag to the `compatibility_flags` array in a TOML wrangler config.
 * If the array doesn't exist, it will be created. If `nodejs_compat`, `nodejs_compat_v2`,
 * or `no_nodejs_compat` is already present, no changes are made.
 *
 * @param wranglerConfig The wrangler TOML configuration object.
 */
function addNodejsCompatFlagToToml(wranglerConfig: TomlTable): void {
	const existingFlags = Array.isArray(wranglerConfig.compatibility_flags)
		? (wranglerConfig.compatibility_flags as string[])
		: [];

	if (
		existingFlags.includes("nodejs_compat") ||
		existingFlags.includes("nodejs_compat_v2") ||
		existingFlags.includes("no_nodejs_compat")
	) {
		return;
	}

	wranglerConfig.compatibility_flags = ["nodejs_compat", ...existingFlags];
}
