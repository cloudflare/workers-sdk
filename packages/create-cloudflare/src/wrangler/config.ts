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
 * Update the `wrangler.toml` file for this project by setting the name
 * to the selected project name and adding the latest compatibility date.
 */
export const updateWranglerConfig = async (ctx: C3Context) => {
	if (wranglerJsonExists(ctx)) {
		const wranglerJsonStr = readWranglerJson(ctx);
		const parsed = jsoncParse(wranglerJsonStr);

		const modified = await ensureCompatDateExists(
			ensureNameExists(parsed, ctx.project.name),
		);

		const comment = `// For more details on how to configure Wrangler, refer to:\n// https://developers.cloudflare.com/workers/wrangler/configuration/\n`;

		modified["$schema"] = "node_modules/wrangler/config-schema.json";
		writeWranglerJson(ctx, comment + JSON.stringify(modified, null, 2));
	} else if (wranglerTomlExists(ctx)) {
		const wranglerTomlStr = readWranglerToml(ctx);
		const parsed = TOML.parse(wranglerTomlStr);
		console.log(wranglerTomlStr);
		const modified = await ensureCompatDateExists(
			ensureNameExists(parsed, ctx.project.name),
		);

		const comment = `#:schema node_modules/wrangler/config-schema.json\n# For more details on how to configure Wrangler, refer to:\n# https://developers.cloudflare.com/workers/wrangler/configuration/\n`;

		writeWranglerToml(ctx, comment + TOML.stringify(modified as JsonMap));
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
