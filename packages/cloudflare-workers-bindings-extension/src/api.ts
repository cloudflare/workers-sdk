import { readFile } from "fs/promises";
import path from "path";
import type Cloudflare from "cloudflare";

export async function getSdk(workspaceRoot: string): Promise<Cloudflare> {
	const wrangler = path.join(
		path.join(
			workspaceRoot,
			"node_modules",
			"wrangler",
			"wrangler-dist",
			"cli.js"
		)
	);

	const { getSdk } = await import(wrangler);

	return getSdk();
}

export async function parseTOML(workspaceRoot: string, file: string) {
	const wrangler = path.join(
		path.join(
			workspaceRoot,
			"node_modules",
			"wrangler",
			"wrangler-dist",
			"cli.js"
		)
	);

	const { parseTOML } = await import(wrangler);

	return parseTOML(await readFile(file, "utf8"));
}
