import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { startDefaultServe } from "../../vitest-setup";

export function preServe() {
	const cwd = process.cwd();
	try {
		process.chdir(resolve(__dirname, ".."));
		rmSync(".wrangler", { force: true, recursive: true });
		execSync(`pnpm wrangler d1 migrations apply prisma-demo-db --local`);
		execSync(
			`pnpm wrangler d1 execute prisma-demo-db --command "INSERT INTO  \"User\" (\"email\", \"name\") VALUES ('jane@prisma.io', 'Jane Doe (Local)');" --local`
		);
		execSync(`pnpm prisma generate`);
	} finally {
		process.chdir(cwd);
	}
}

export async function serve() {
	return startDefaultServe();
}
