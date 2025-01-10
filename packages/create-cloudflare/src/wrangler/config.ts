import { existsSync } from "fs";
import { resolve } from "path";
import TOML from "@iarna/toml";
import { getWorkerdCompatibilityDate } from "helpers/compatDate";
import { readFile, writeFile } from "helpers/files";
import { parse as jsoncParse } from "jsonc-parser";
import type { JsonMap } from "@iarna/toml";
import type { C3Context } from "types";

function ensureNameExists(
	config: Record<string, unknown>,
	projectName: string,
): Record<string, unknown> {
	config["name"] = projectName;
	return config;
}

async function ensureCompatDateExists(
	config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	if (typeof config["compatibility_date"] === "string") {
		// If the compat date is already a valid one, leave it since it may be there
		// for a specific compat reason
		const validCompatDateRe = /^\d{4}-\d{2}-\d{2}/m;
		if (!config["compatibility_date"].match(validCompatDateRe)) {
			config["compatibility_date"] = await getWorkerdCompatibilityDate();
		}
	} else {
		config["compatibility_date"] = await getWorkerdCompatibilityDate();
	}
	return config;
}
/**
 * Update the `wrangler.(toml|json|jsonc)` file for this project by setting the name
 * to the selected project name and adding the latest compatibility date.
 */
export const updateWranglerConfig = async (ctx: C3Context) => {
	if (wranglerJsonExists(ctx)) {
		const wranglerJsonStr = readWranglerJson(ctx);
		const parsed = jsoncParse(wranglerJsonStr, undefined, {
			allowTrailingComma: true,
		});

		const modified = await ensureCompatDateExists(
			ensureNameExists(parsed, ctx.project.name),
		);

		const comment = `/**\n * For more details on how to configure Wrangler, refer to:\n * https://developers.cloudflare.com/workers/wrangler/configuration/\n */\n{\n  "$schema": "node_modules/wrangler/config-schema.json",`;

		if (!modified["observability"]) {
			modified["observability"] = { enabled: true };
		}
		const stringified = comment + JSON.stringify(modified, null, 2).slice(1);

		writeWranglerJson(
			ctx,
			stringified.slice(0, -2) +
				`
  /**
   * Smart Placement
   * Docs: https://developers.cloudflare.com/workers/configuration/smart-placement/#smart-placement
   */
  // "placement": { "mode": "smart" },

  /**
   * Bindings
   * Bindings allow your Worker to interact with resources on the Cloudflare Developer Platform, including
   * databases, object storage, AI inference, real-time communication and more.
   * https://developers.cloudflare.com/workers/runtime-apis/bindings/
   */

  /**
   * Environment Variables
   * https://developers.cloudflare.com/workers/wrangler/configuration/#environment-variables
   */
  // "vars": { "MY_VARIABLE": "production_value" },
  /**
   * Note: Use secrets to store sensitive data.
   * https://developers.cloudflare.com/workers/configuration/secrets/
   */

  /**
   * Static Assets
   * https://developers.cloudflare.com/workers/static-assets/binding/
   */
  // "assets": { "directory": "./public/", "binding": "ASSETS" },

  /**
   * Service Bindings (communicate between multiple Workers)
   * https://developers.cloudflare.com/workers/wrangler/configuration/#service-bindings
   */
  // "services": [{ "binding": "MY_SERVICE", "service": "my-service" }]
}
`,
		);
	} else if (wranglerTomlExists(ctx)) {
		const wranglerTomlStr = readWranglerToml(ctx);
		const parsed = TOML.parse(wranglerTomlStr);
		const modified = await ensureCompatDateExists(
			ensureNameExists(parsed, ctx.project.name),
		);
		if (!modified["observability"]) {
			modified["observability"] = { enabled: true };
		}

		const comment = `#:schema node_modules/wrangler/config-schema.json\n# For more details on how to configure Wrangler, refer to:\n# https://developers.cloudflare.com/workers/wrangler/configuration/\n`;

		const stringified = comment + TOML.stringify(modified as JsonMap);

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
		return readFile(wranglerJsonPath);
	}
	const wranglerJsoncPath = getWranglerJsoncPath(ctx);
	return readFile(wranglerJsoncPath);
};

export const writeWranglerToml = (ctx: C3Context, contents: string) => {
	const wranglerTomlPath = getWranglerTomlPath(ctx);
	return writeFile(wranglerTomlPath, contents);
};

export const writeWranglerJson = (ctx: C3Context, contents: string) => {
	const wranglerJsonPath = getWranglerJsonPath(ctx);
	if (existsSync(wranglerJsonPath)) {
		return writeFile(wranglerJsonPath, contents);
	}
	const wranglerJsoncPath = getWranglerJsoncPath(ctx);
	return writeFile(wranglerJsoncPath, contents);
};
