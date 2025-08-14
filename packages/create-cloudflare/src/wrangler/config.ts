import { existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import TOML from "@iarna/toml";
import { getWorkerdCompatibilityDate } from "helpers/compatDate";
import { readFile, writeFile, writeJSON } from "helpers/files";
import {
	addJSONComment,
	appendJSONProperty,
	insertJSONProperty,
	readJSONWithComments,
	writeJSONWithComments,
} from "helpers/json";
import type { JsonMap } from "@iarna/toml";
import type { CommentObject } from "comment-json";
import type { C3Context } from "types";

/**
 * Update the `wrangler.(toml|json|jsonc)` file for this project by setting the name
 * to the selected project name and adding the latest compatibility date.
 */
export const updateWranglerConfig = async (ctx: C3Context) => {
	if (wranglerJsonExists(ctx)) {
		let wranglerJson = readWranglerJson(ctx);

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
			await getCompatibilityDate(wranglerJson),
		);
		wranglerJson = appendJSONProperty(wranglerJson, "observability", {
			enabled: true,
		});

		addJSONComment(
			wranglerJson,
			"before-all",
			"*\n * For more details on how to configure Wrangler, refer to:\n * https://developers.cloudflare.com/workers/wrangler/configuration/\n ",
		);

		addJSONComment(wranglerJson, "after:observability", [
			"*\n * Smart Placement\n * Docs: https://developers.cloudflare.com/workers/configuration/smart-placement/#smart-placement\n ",
			{
				type: "LineComment",
				value: ` "placement": { "mode": "smart" }`,
			},
			"*\n * Bindings\n * Bindings allow your Worker to interact with resources on the Cloudflare Developer Platform, including\n * databases, object storage, AI inference, real-time communication and more.\n * https://developers.cloudflare.com/workers/runtime-apis/bindings/\n ",
			"*\n * Environment Variables\n * https://developers.cloudflare.com/workers/wrangler/configuration/#environment-variables\n ",
			{
				type: "LineComment",
				value: ' "vars": { "MY_VARIABLE": "production_value" }',
			},
			"*\n * Note: Use secrets to store sensitive data.\n * https://developers.cloudflare.com/workers/configuration/secrets/\n ",
			"*\n * Static Assets\n * https://developers.cloudflare.com/workers/static-assets/binding/\n ",
			{
				type: "LineComment",
				value: ' "assets": { "directory": "./public/", "binding": "ASSETS" }',
			},
			"*\n * Service Bindings (communicate between multiple Workers)\n * https://developers.cloudflare.com/workers/wrangler/configuration/#service-bindings\n ",
			{
				type: "LineComment",
				value:
					' "services": [{ "binding": "MY_SERVICE", "service": "my-service" }]',
			},
		]);

		writeWranglerJson(ctx, wranglerJson);
		addVscodeConfig(ctx);
	} else if (wranglerTomlExists(ctx)) {
		const wranglerTomlStr = readWranglerToml(ctx);
		const parsed = TOML.parse(wranglerTomlStr);
		parsed.name = ctx.project.name;
		parsed["compatibility_date"] = await getCompatibilityDate(parsed);
		parsed["observability"] ??= { enabled: true };

		const comment = `#:schema node_modules/wrangler/config-schema.json\n# For more details on how to configure Wrangler, refer to:\n# https://developers.cloudflare.com/workers/wrangler/configuration/\n`;

		const stringified = comment + TOML.stringify(parsed as JsonMap);

		writeWranglerToml(
			ctx,
			stringified +
				`
# Smart Placement
# Docs: https://developers.cloudflare.com/workers/configuration/smart-placement/#smart-placement
# [placement]
# mode = "smart"

###
# Bindings
# Bindings allow your Worker to interact with resources on the Cloudflare Developer Platform, including
# databases, object storage, AI inference, real-time communication and more.
# https://developers.cloudflare.com/workers/runtime-apis/bindings/
###

# Environment Variables
# https://developers.cloudflare.com/workers/wrangler/configuration/#environment-variables
# [vars]
# MY_VARIABLE = "production_value"

# Note: Use secrets to store sensitive data.
# https://developers.cloudflare.com/workers/configuration/secrets/

# Static Assets
# https://developers.cloudflare.com/workers/static-assets/binding/
# [assets]
# directory = "./public/"
# binding = "ASSETS"

# Service Bindings (communicate between multiple Workers)
# https://developers.cloudflare.com/workers/wrangler/configuration/#service-bindings
# [[services]]
# binding = "MY_SERVICE"
# service = "my-service"
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

/** Checks for wrangler.json and wrangler.jsonc */
export const wranglerJsonExists = (ctx: C3Context) => {
	const wranglerJsonPath = getWranglerJsonPath(ctx);
	const wranglerJsoncPath = getWranglerJsoncPath(ctx);
	return existsSync(wranglerJsonPath) || existsSync(wranglerJsoncPath);
};

export const readWranglerToml = (ctx: C3Context) => {
	const wranglerTomlPath = getWranglerTomlPath(ctx);
	return readFile(wranglerTomlPath);
};

export const readWranglerJson = (ctx: C3Context) => {
	const wranglerJsonPath = getWranglerJsonPath(ctx);
	if (existsSync(wranglerJsonPath)) {
		return readJSONWithComments(wranglerJsonPath);
	}
	const wranglerJsoncPath = getWranglerJsoncPath(ctx);
	return readJSONWithComments(wranglerJsoncPath);
};

export const writeWranglerToml = (ctx: C3Context, contents: string) => {
	const wranglerTomlPath = getWranglerTomlPath(ctx);
	return writeFile(wranglerTomlPath, contents);
};

export const writeWranglerJson = (ctx: C3Context, config: CommentObject) => {
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

async function getCompatibilityDate<T extends Record<string, unknown>>(
	config: T,
) {
	const validCompatDateRe = /^\d{4}-\d{2}-\d{2}$/m;
	if (
		typeof config["compatibility_date"] === "string" &&
		config["compatibility_date"].match(validCompatDateRe)
	) {
		// If the compat date is already a valid one, leave it since it may be there for a specific compat reason
		return config["compatibility_date"];
	}
	return await getWorkerdCompatibilityDate();
}
