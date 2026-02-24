import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { loadConfig, startDefaultServe } from "../../vitest-setup";

export async function preServe() {
	const cwd = process.cwd();
	try {
		process.chdir(resolve(__dirname, ".."));
		removeDirSync(".wrangler");
		execSync(`pnpm wrangler d1 migrations apply prisma-demo-db --local`);
		execSync(
			`pnpm wrangler d1 execute prisma-demo-db --command "INSERT INTO  "User" ("email", "name") VALUES ('jane@prisma.io', 'Jane Doe (Local)');" --local`
		);
		execSync(`pnpm prisma generate`);
	} finally {
		process.chdir(cwd);
	}

	// Remove the cache directory that stores the pre-bundled optimized dependencies.
	const config = await loadConfig({ command: "serve", mode: "development" });
	removeDirSync(resolve(config.root, config.cacheDir));
}

export async function serve() {
	return startDefaultServe();
}
