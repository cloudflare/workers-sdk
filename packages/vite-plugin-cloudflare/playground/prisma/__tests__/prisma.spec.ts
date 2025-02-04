import * as child_process from "node:child_process";
import * as fs from "node:fs";
import { beforeAll, expect, test } from "vitest";
import { getJsonResponse, isBuild } from "../../__test-utils__";

beforeAll(() => {
	fs.rmSync(".wrangler", { recursive: true, force: true });
	// Apply database migration
	child_process.execSync(
		`pnpm wrangler d1 migrations apply prisma-demo-db --local`
	);
	// Seed data
	child_process.execSync(`pnpm wrangler d1 execute prisma-demo-db --command "INSERT INTO  \"User\" (\"email\", \"name\") VALUES
('jane@prisma.io', 'Jane Doe (Local)');" --local`);
});

test.runIf(isBuild)("runs D1 query using Prisma", async () => {
	const result = await getJsonResponse();
	expect(result).toEqual([
		{ id: 1, email: "jane@prisma.io", name: "Jane Doe (Local)" },
	]);
});
